import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { RedisService } from '@/infra/redis/redis.service';
import { TelegramService } from '@/telegram/telegram.service';
import { newToken, tokenHash } from '@/api/auth/auth.service';
import { rewriteOptionsSchema } from '@/ai/ai.service';

import { CreateRouteDto, UpdateRouteDto } from './dto/channels.dto';

@Injectable()
export class ChannelsService implements OnModuleInit {
  constructor(
    private readonly db: PrismaService,
    private readonly bot: TelegramService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit() {
    this.bot.instance.start(async (ctx) => {
      const token = ctx.startPayload;

      if (!token) {
        await ctx.reply('Connect your account from CopywriteRepostBot → Channels.');

        return;
      }

      try {
        const userId = await this.db.$transaction(async (tx) => {
          const record = await tx.accountToken.findUnique({ where: { hash: tokenHash(token) } });

          if (!record || record.kind !== 'telegram' || record.expiresAt <= new Date())
            throw new BadRequestException('Expired link');

          const deleted = await tx.accountToken.deleteMany({ where: { id: record.id } });

          if (deleted.count !== 1) throw new BadRequestException('Link already used');

          const account = await tx.user.findUniqueOrThrow({ where: { id: record.userId } });

          if (account.telegramId && account.telegramId !== String(ctx.from.id))
            throw new ConflictException('Account is already linked');

          await tx.user.update({
            where: { id: record.userId },
            data: { telegramId: String(ctx.from.id) },
          });

          return record.userId;
        });

        await this.redis.del(`user:id:${userId}`);
        await ctx.reply('Telegram connected. Return to the app and add your channels.');
      } catch {
        await ctx.reply(
          'This link is invalid, expired, or already linked. Create a new link in the app.',
        );
      }
    });
  }

  async connect(ownerId: string) {
    const token = newToken();
    const me = await this.bot.telegram.getMe();

    await this.db.accountToken.create({
      data: {
        userId: ownerId,
        hash: tokenHash(token),
        kind: 'telegram',
        expiresAt: new Date(Date.now() + 600_000),
      },
    });

    return { url: `https://t.me/${me.username}?start=${token}` };
  }

  async checkRights(ownerId: string, chatId: string) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: ownerId } });

    if (!user.telegramId) throw new BadRequestException('Connect Telegram first');

    const chat = await this.bot.telegram.getChat(chatId);

    if (chat.type !== 'channel') throw new BadRequestException('Only channels are supported');

    const me = await this.bot.telegram.getMe();
    const [member, bot] = await Promise.all([
      this.bot.telegram.getChatMember(chat.id, Number(user.telegramId)),
      this.bot.telegram.getChatMember(chat.id, me.id),
    ]);

    if (!['creator', 'administrator'].includes(member.status))
      throw new ForbiddenException('Channel administrator rights required');
    if (bot.status !== 'administrator')
      throw new ForbiddenException('Add the bot as channel administrator');

    return {
      chatId: String(chat.id),
      title: chat.title,
      username: chat.username ?? null,
      canPublish: bot.can_post_messages === true,
    };
  }

  async add(ownerId: string, identifier: string) {
    identifier = identifier.trim();

    if (!/^(@[a-zA-Z0-9_]{5,}|-?100\d+)$/.test(identifier))
      throw new BadRequestException('Enter a channel username or numeric ID');

    const chatId =
      identifier.startsWith('@') || identifier.startsWith('-') ? identifier : `-${identifier}`;
    const info = await this.checkRights(ownerId, chatId);
    const existing = await this.db.channel.findUnique({ where: { chatId: info.chatId } });

    if (existing && existing.ownerId !== ownerId)
      throw new ConflictException('Channel is already connected');

    return this.db.channel.upsert({
      where: { chatId: info.chatId },
      update: info,
      create: { ownerId, ...info },
    });
  }

  list(ownerId: string) {
    return this.db.channel.findMany({ where: { ownerId }, orderBy: { title: 'asc' } });
  }

  async owned(ownerId: string, id: string) {
    const channel = await this.db.channel.findFirst({ where: { id, ownerId } });

    if (!channel) throw new NotFoundException('Channel not found');

    return channel;
  }

  async remove(ownerId: string, id: string) {
    await this.owned(ownerId, id);

    if (await this.db.route.count({ where: { OR: [{ sourceId: id }, { targetId: id }] } }))
      throw new ConflictException('Remove routes using this channel first');

    return this.db.channel.delete({ where: { id } });
  }

  routes(ownerId: string) {
    return this.db.route.findMany({
      where: { ownerId },
      include: { source: true, target: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createRoute(ownerId: string, dto: CreateRouteDto) {
    const source = await this.owned(ownerId, dto.sourceId);

    await this.checkRights(ownerId, source.chatId);

    const target = await this.owned(ownerId, dto.targetId);
    const rights = await this.checkRights(ownerId, target.chatId);

    if (!rights.canPublish) throw new ForbiddenException('Bot needs permission to publish');

    const options = rewriteOptionsSchema.parse(dto.options);

    return this.db.$transaction(async (tx) => {
      // Serialize graph changes per account so concurrent routes cannot introduce a cycle.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`;

      const edges = await tx.route.findMany({
        where: { ownerId },
        select: { sourceId: true, targetId: true },
      });

      assertAcyclic(edges, dto.sourceId, dto.targetId);

      return tx.route.create({
        data: { ownerId, sourceId: dto.sourceId, targetId: dto.targetId, name: dto.name, options },
      });
    });
  }

  async updateRoute(ownerId: string, id: string, dto: UpdateRouteDto) {
    const route = await this.db.route.findFirst({ where: { ownerId, id } });

    if (!route) throw new NotFoundException('Route not found');

    const { options, ...data } = dto;

    return this.db.route.update({
      where: { id },
      data: {
        ...data,
        ...(options ? { options: rewriteOptionsSchema.parse(options) } : {}),
      },
    });
  }

  async removeRoute(ownerId: string, id: string) {
    const route = await this.db.route.findFirst({ where: { ownerId, id } });

    if (!route) throw new NotFoundException('Route not found');
    if (
      await this.db.operation.count({
        where: { post: { routeId: id }, status: { in: ['PENDING', 'RUNNING'] } },
      })
    )
      throw new ConflictException('Wait for operations to finish');

    return this.db.route.delete({ where: { id } });
  }
}

export function assertAcyclic(
  edges: { sourceId: string; targetId: string }[],
  source: string,
  target: string,
): void {
  const visit = [target];
  const seen = new Set<string>();

  while (visit.length) {
    const node = visit.pop()!;

    if (node === source) throw new BadRequestException('Route creates a cycle');
    if (seen.has(node)) continue;

    seen.add(node);
    visit.push(...edges.filter((e) => e.sourceId === node).map((e) => e.targetId));
  }
}
