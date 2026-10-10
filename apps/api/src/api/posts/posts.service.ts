import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
  OnApplicationBootstrap,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BullRegistrar, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Message } from 'telegraf/types';
import { Readable } from 'node:stream';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { Prisma } from '@generated/prisma/client';
import { TelegramService } from '@/telegram/telegram.service';
import { rewriteOptionsSchema } from '@/ai/ai.service';
import { ChannelsService } from '@/api/channels/channels.service';
import { telegramHtml, messageToHtml } from '@/telegram/telegram-html';
import { mediaContentType } from '@/telegram/media-content-type';

import { EditPostDto, GenerateDto } from './dto/posts.dto';

const MAX_MEDIA_PREVIEW_BYTES = 20 * 1024 * 1024;

export const postInclude = {
  route: { include: { source: true, target: true } },
  media: { orderBy: { messageId: 'asc' as const } },
  revisions: { orderBy: { version: 'desc' as const } },
};

export type FullPost = Prisma.PostGetPayload<{ include: typeof postInclude }>;

@Injectable()
export class PostsService implements OnModuleInit, OnModuleDestroy, OnApplicationBootstrap {
  private readonly logger = new Logger(PostsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private stopping = false;
  private recovering = false;

  constructor(
    private readonly db: PrismaService,
    private readonly bot: TelegramService,
    @InjectQueue('posts') private readonly queue: Queue,
    private readonly registrar: BullRegistrar,
    private readonly channels: ChannelsService,
  ) {}

  async onModuleInit() {
    this.bot.instance.on('channel_post', async (ctx) => {
      try {
        await this.ingest(ctx.channelPost);
      } catch (error) {
        if (error instanceof BadRequestException)
          this.logger.warn({ event: 'Unsupported Telegram post', updateId: ctx.update.update_id });
        else throw error;
      }
    });

    // A send interrupted by a crash is ambiguous; never let a recovered job send it again.
    const interrupted = await this.db.operation.findMany({ where: { status: 'RUNNING' } });

    for (const operation of interrupted) {
      const publishing = operation.kind === 'PUBLISH';

      await this.db.$transaction([
        this.db.post.update({
          where: { id: operation.postId },
          data: {
            status: publishing ? 'PUBLICATION_UNKNOWN' : 'FAILED',
            error: publishing
              ? 'Check Telegram before retrying'
              : 'Generation interrupted; retry manually',
            failureStage: publishing ? 'publish' : 'generate',
          },
        }),
        this.db.operation.update({
          where: { id: operation.id },
          data: { status: publishing ? 'UNKNOWN' : 'FAILED' },
        }),
      ]);
    }

    this.timer = setInterval(() => {
      void this.recover();
    }, 1000);
    this.timer.unref();
    await this.recover();
  }

  onApplicationBootstrap() {
    this.registrar.register();
  }

  onModuleDestroy() {
    this.stopping = true;

    if (this.timer) clearInterval(this.timer);
  }

  async recover() {
    if (this.stopping || this.recovering) return;

    this.recovering = true;

    try {
      const albums = await this.db.post.findMany({
        where: { status: 'COLLECTING', lastReceivedAt: { lte: new Date(Date.now() - 1000) } },
        include: { media: true },
      });

      for (const post of albums) {
        const valid = post.media.length >= 2 && post.media.length <= 10;

        await this.db.post.updateMany({
          where: { id: post.id, status: 'COLLECTING', lastReceivedAt: post.lastReceivedAt },
          data: {
            status: valid ? 'INBOX' : 'SKIPPED',
            error: valid ? null : 'Album must contain 2–10 media items',
          },
        });
      }

      const operations = await this.db.operation.findMany({
        where: { status: 'PENDING' },
        take: 100,
        orderBy: { createdAt: 'asc' },
      });

      for (const operation of operations)
        await this.queue.add(
          'operation',
          { id: operation.id },
          { jobId: operation.id, attempts: 1, removeOnComplete: true, removeOnFail: true },
        );
    } catch (error) {
      this.logger.error({
        event: 'Post recovery failed',
        error: error instanceof Error ? error.name : 'UnknownError',
      });
    } finally {
      this.recovering = false;
    }
  }

  async ingest(message: Message) {
    if (this.stopping || !('text' in message || 'photo' in message || 'video' in message)) return;

    const routes = await this.db.route.findMany({
      where: { active: true, source: { chatId: String(message.chat.id) } },
    });
    const album = 'media_group_id' in message && message.media_group_id;
    const sourceKey = album ? `album:${album}` : `message:${message.message_id}`;
    const html = telegramHtml(messageToHtml(message), !('text' in message));

    if (routes.length) {
      try {
        await this.channels.checkRights(routes[0].ownerId, String(message.chat.id));
      } catch (error) {
        if (!(error instanceof ForbiddenException || error instanceof BadRequestException))
          throw error;

        this.logger.warn({ event: 'Source access revoked', channelId: message.chat.id });

        return;
      }
    }

    for (const route of routes) {
      await this.db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${route.id + sourceKey}))`;

        const existing = await tx.post.findUnique({
          where: { routeId_sourceKey: { routeId: route.id, sourceKey } },
        });

        if (existing && (!album || existing.status !== 'COLLECTING')) return;

        const post =
          existing ??
          (await tx.post.create({
            data: {
              routeId: route.id,
              sourceKey,
              originalHtml: html,
              status: album ? 'COLLECTING' : 'INBOX',
            },
          }));

        if ('photo' in message || 'video' in message) {
          const fileId = 'photo' in message ? message.photo.at(-1)?.file_id : message.video.file_id;

          if (!fileId) throw new BadRequestException('Missing media');

          const added = await tx.postMedia.createMany({
            data: [
              {
                postId: post.id,
                messageId: message.message_id,
                type: 'photo' in message ? 'photo' : 'video',
                fileId,
                originalCaption: html,
              },
            ],
            skipDuplicates: true,
          });

          if (added.count)
            await tx.post.update({ where: { id: post.id }, data: { lastReceivedAt: new Date() } });
        }
      });
    }
  }

  async owned(ownerId: string, id: string): Promise<FullPost> {
    const post = await this.db.post.findFirst({
      where: { id, route: { ownerId } },
      include: postInclude,
    });

    if (!post) throw new NotFoundException('Post not found');

    return post;
  }

  async media(ownerId: string, postId: string, mediaId: string) {
    const post = await this.owned(ownerId, postId);
    const media = post.media.find((item) => item.id === mediaId);

    if (!media) throw new NotFoundException('Media not found');

    try {
      const file = await this.bot.telegram.getFile(media.fileId);

      if (!file.file_path || (file.file_size ?? 0) > MAX_MEDIA_PREVIEW_BYTES) {
        throw new Error('Media unavailable or exceeds preview limit');
      }

      const url = await this.bot.telegram.getFileLink(file);
      const upstream = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
      });
      const body = upstream.body;

      if (!upstream.ok || !body) throw new Error('Media unavailable');

      const upstreamType = upstream.headers.get('content-type') ?? '';

      if (
        !/^(image\/(jpeg|png|webp)|video\/mp4|application\/octet-stream)(;|$)/i.test(upstreamType)
      ) {
        await body.cancel();
        throw new Error('Unsupported preview');
      }

      const reader = body.getReader();
      const prefix: Uint8Array[] = [];
      let bytes = 0;

      // A file signature can be split across network chunks.
      while (bytes < 12) {
        const { value, done } = await reader.read();

        if (done) break;

        bytes += value.length;

        if (bytes > MAX_MEDIA_PREVIEW_BYTES) {
          await reader.cancel();
          throw new Error('Preview limit exceeded');
        }

        prefix.push(value);
      }

      const contentType = mediaContentType(Buffer.concat(prefix));

      if (
        !contentType ||
        (media.type === 'photo' && !contentType.startsWith('image/')) ||
        (media.type === 'video' && contentType !== 'video/mp4')
      ) {
        await reader.cancel();
        throw new Error('Unsupported preview');
      }

      const stream = new Readable({
        read() {
          void reader.read().then(
            ({ value, done }) => {
              if (done) {
                this.push(null);
                return;
              }

              bytes += value.length;

              if (bytes > MAX_MEDIA_PREVIEW_BYTES) {
                this.destroy(new Error('Preview limit exceeded'));
                return;
              }

              this.push(value);
            },
            (error: unknown) => {
              this.destroy(error instanceof Error ? error : new Error('Media download failed'));
            },
          );
        },
        destroy(error, callback) {
          void reader.cancel().then(
            () => callback(error),
            () => callback(error),
          );
        },
      });

      for (const chunk of prefix) stream.push(chunk);

      return { stream, contentType };
    } catch {
      throw new ServiceUnavailableException(
        'Media preview is unavailable; the saved Telegram file can still be published',
      );
    }
  }

  async list(ownerId: string, routeId?: string, cursor?: string, view?: string) {
    if (cursor) await this.owned(ownerId, cursor);

    const posts = await this.db.post.findMany({
      where: {
        route: { ownerId },
        ...(routeId ? { routeId } : {}),
        status:
          view === 'history'
            ? { in: ['PUBLISHED', 'PUBLICATION_UNKNOWN'] }
            : { notIn: ['COLLECTING', 'SKIPPED', 'PUBLISHED'] },
      },
      include: postInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 30,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    return { posts, nextCursor: posts.length === 30 ? posts.at(-1)?.id : null };
  }

  async edit(ownerId: string, id: string, dto: EditPostDto) {
    const post = await this.owned(ownerId, id);

    if (!['INBOX', 'DRAFT', 'FAILED'].includes(post.status))
      throw new ConflictException('Post cannot be edited now');

    const html = telegramHtml(dto.html, post.media.length > 0);
    const captions = post.media.map((item) => {
      const caption = dto.captions.find((c) => c.messageId === item.messageId);

      if (!caption) throw new BadRequestException('Caption missing');

      return { messageId: item.messageId, html: telegramHtml(caption.html, true) };
    });

    if (!post.media.length && !html.trim()) throw new BadRequestException('Empty post');

    return this.db.$transaction(async (tx) => {
      const updated = await tx.post.updateMany({
        where: { id, revision: dto.revision, status: post.status },
        data: { revision: { increment: 1 }, status: 'DRAFT', error: null, failureStage: null },
      });

      if (!updated.count) throw new ConflictException('Post changed; reload it');

      return tx.postRevision.create({
        data: { postId: id, version: dto.revision + 1, origin: 'manual', html, captions },
      });
    });
  }

  async generate(ownerId: string, id: string, dto: GenerateDto) {
    const post = await this.owned(ownerId, id);
    const options = rewriteOptionsSchema.parse(dto.options ?? post.route.options);

    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;

      const current = await tx.post.findUniqueOrThrow({ where: { id } });
      const duplicate = await tx.operation.findUnique({
        where: {
          postId_kind_revision: { postId: id, kind: 'GENERATE', revision: dto.revision + 1 },
        },
      });

      if (duplicate) return duplicate;
      if (
        !['INBOX', 'DRAFT', 'FAILED'].includes(current.status) ||
        current.revision !== dto.revision
      )
        throw new ConflictException('Post changed; reload it');

      await tx.post.update({
        where: { id },
        data: { status: 'GENERATING', revision: { increment: 1 }, error: null, failureStage: null },
      });

      return tx.operation.create({
        data: { postId: id, kind: 'GENERATE', revision: dto.revision + 1, options },
      });
    });
  }

  async publish(ownerId: string, id: string, revision: number) {
    const post = await this.owned(ownerId, id);
    const draft = post.revisions.find((r) => r.version === revision);

    if (!draft) throw new BadRequestException('Save a draft before publishing');

    telegramHtml(draft.html, post.media.length > 0);

    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;

      const duplicate = await tx.operation.findUnique({
        where: { postId_kind_revision: { postId: id, kind: 'PUBLISH', revision } },
      });

      if (duplicate) return duplicate;

      const updated = await tx.post.updateMany({
        where: { id, revision, status: 'DRAFT' },
        data: { status: 'PUBLISHING', error: null },
      });

      if (!updated.count) throw new ConflictException('Post changed; reload it');

      return tx.operation.create({
        data: {
          postId: id,
          kind: 'PUBLISH',
          revision,
          options: rewriteOptionsSchema.parse(post.route.options),
        },
      });
    });
  }

  async operation(ownerId: string, id: string) {
    const operation = await this.db.operation.findFirst({
      where: { id, post: { route: { ownerId } } },
    });

    if (!operation) throw new NotFoundException('Operation not found');

    return operation;
  }

  async resolve(ownerId: string, id: string, published: boolean) {
    const post = await this.owned(ownerId, id);

    return this.db.$transaction(async (tx) => {
      const updated = await tx.post.updateMany({
        where: { id, status: 'PUBLICATION_UNKNOWN', revision: post.revision },
        data: {
          status: published ? 'PUBLISHED' : 'DRAFT',
          error: null,
          ...(published ? {} : { revision: { increment: 1 } }),
        },
      });

      if (!updated.count) throw new ConflictException('Post is not awaiting verification');

      if (!published) {
        const draft = post.revisions.find((r) => r.version === post.revision);

        if (!draft) throw new ConflictException('Draft not found');

        await tx.postRevision.create({
          data: {
            postId: id,
            version: post.revision + 1,
            origin: 'manual',
            html: draft.html,
            captions: draft.captions ?? [],
          },
        });
      }

      return { published };
    });
  }

  async metrics(ownerId: string) {
    const runs = await this.db.aiRun.aggregate({
      where: { post: { route: { ownerId } } },
      _count: true,
      _sum: { inputTokens: true, outputTokens: true },
      _avg: { durationMs: true },
    });
    const failures = await this.db.aiRun.count({
      where: { post: { route: { ownerId } }, outcome: { not: 'success' } },
    });

    return {
      calls: runs._count,
      inputTokens: runs._sum.inputTokens,
      outputTokens: runs._sum.outputTokens,
      averageDurationMs: runs._avg.durationMs,
      failures,
    };
  }
}
