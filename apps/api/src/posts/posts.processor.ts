import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleDestroy, BeforeApplicationShutdown } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { AiService } from '@/ai/ai.service';
import { RewriteError, rewriteOptionsSchema } from '@/ai/rewrite-options';
import { ChannelsService } from '@/channels/channels.service';
import { TelegramService } from '@/telegram/telegram.service';
import { telegramHtml } from './telegram-html';
import { postInclude } from './posts.service';
import { z } from 'zod';
const captionsSchema = z.array(z.object({ messageId: z.number(), html: z.string() }));
@Injectable()
@Processor('posts', { concurrency: 2 })
export class PostsProcessor
  extends WorkerHost
  implements OnModuleDestroy, BeforeApplicationShutdown
{
  private readonly logger = new Logger(PostsProcessor.name);
  private stopping = false;
  constructor(
    private readonly db: PrismaService,
    private readonly ai: AiService,
    private readonly bot: TelegramService,
    private readonly channels: ChannelsService,
  ) {
    super();
  }
  onModuleDestroy() {
    this.stopping = true;
  }
  async beforeApplicationShutdown() {
    await this.worker.close();
  }
  async process(job: Job<{ id: string }>) {
    const operation = await this.db.operation.findUniqueOrThrow({ where: { id: job.data.id } });
    if (this.stopping || operation.status !== 'PENDING') return;
    const post = await this.db.post.findUniqueOrThrow({
      where: { id: operation.postId },
      include: postInclude,
    });
    const claimed = await this.db.operation.updateMany({
      where: { id: operation.id, status: 'PENDING' },
      data: { status: 'RUNNING' },
    });
    if (!claimed.count) return;
    let sendStarted = false;
    try {
      if (operation.kind === 'GENERATE') {
        const options = rewriteOptionsSchema.parse(operation.options);
        const inputs = post.media.length
          ? post.media.map((m) => ({ messageId: m.messageId, text: m.originalCaption }))
          : [{ messageId: 0, text: post.originalHtml }];
        const captions: { messageId: number; html: string }[] = [];
        for (const input of inputs) {
          if (this.stopping) throw new Error('Shutdown interrupted generation');
          try {
            const result = await this.ai.rewrite(input.text, options);
            let html: string;
            try {
              html = telegramHtml(result.html, post.media.length > 0);
            } catch (error) {
              if (result.outcome !== 'skipped')
                await this.db.aiRun.create({
                  data: {
                    postId: post.id,
                    options,
                    ...this.metadata(result),
                    outcome: 'invalid_html',
                  },
                });
              throw error;
            }
            if (result.outcome !== 'skipped')
              await this.db.aiRun.create({
                data: { postId: post.id, options, ...this.metadata(result) },
              });
            captions.push({ messageId: input.messageId, html });
          } catch (error) {
            if (error instanceof RewriteError)
              await this.db.aiRun.create({
                data: { postId: post.id, options, ...this.metadata(error.metadata) },
              });
            throw error;
          }
        }
        if (this.stopping) throw new Error('Shutdown interrupted generation');
        await this.db.$transaction([
          this.db.postRevision.create({
            data: {
              postId: post.id,
              version: operation.revision,
              origin: 'ai',
              html: captions[0]?.html ?? '',
              captions: post.media.length ? captions : [],
            },
          }),
          this.db.post.update({ where: { id: post.id }, data: { status: 'DRAFT', error: null } }),
          this.db.operation.update({ where: { id: operation.id }, data: { status: 'COMPLETED' } }),
        ]);
      } else {
        const target = post.route.target;
        const rights = await this.channels.checkRights(post.route.ownerId, target.chatId);
        if (!rights.canPublish) throw new Error('Bot no longer has permission to publish');
        const draft = post.revisions.find((r) => r.version === operation.revision);
        if (!draft) throw new Error('Draft missing');
        const captions = captionsSchema.parse(draft.captions);
        const html = telegramHtml(draft.html, post.media.length > 0);
        const media = post.media.map((item) => ({
          type: item.type === 'photo' ? ('photo' as const) : ('video' as const),
          media: item.fileId,
          caption: telegramHtml(
            captions.find((c) => c.messageId === item.messageId)?.html ?? '',
            true,
          ),
          parse_mode: 'HTML' as const,
        }));
        if (media.length > 1 && (media.length < 2 || media.length > 10))
          throw new Error('Invalid album');
        if (!media.length && !html.trim()) throw new Error('Empty post');
        if (this.stopping) throw new Error('Publication cancelled by shutdown');
        sendStarted = true;
        let ids: number[];
        if (media.length > 1)
          ids = (await this.bot.telegram.sendMediaGroup(target.chatId, media)).map(
            (m) => m.message_id,
          );
        else if (media.length === 1) {
          const item = media[0];
          const sent =
            item.type === 'photo'
              ? await this.bot.telegram.sendPhoto(target.chatId, item.media, item)
              : await this.bot.telegram.sendVideo(target.chatId, item.media, item);
          ids = [sent.message_id];
        } else
          ids = [
            (await this.bot.telegram.sendMessage(target.chatId, html, { parse_mode: 'HTML' }))
              .message_id,
          ];
        await this.db.$transaction([
          this.db.post.update({
            where: { id: post.id },
            data: { status: 'PUBLISHED', publishedIds: ids, error: null },
          }),
          this.db.operation.update({ where: { id: operation.id }, data: { status: 'COMPLETED' } }),
        ]);
      }
    } catch (error) {
      const response =
        error && typeof error === 'object' && 'response' in error ? error.response : undefined;
      const rejected =
        response &&
        typeof response === 'object' &&
        'error_code' in response &&
        typeof response.error_code === 'number' &&
        response.error_code < 500;
      const unknown = sendStarted && !rejected;
      const failure =
        error instanceof RewriteError
          ? error.metadata.outcome
          : unknown
            ? 'Check Telegram before retrying'
            : 'Operation failed; check permissions or edit and retry';
      await this.db.$transaction([
        this.db.post.update({
          where: { id: post.id },
          data: {
            status: unknown ? 'PUBLICATION_UNKNOWN' : 'FAILED',
            error: failure,
            failureStage: operation.kind.toLowerCase(),
          },
        }),
        this.db.operation.update({
          where: { id: operation.id },
          data: { status: unknown ? 'UNKNOWN' : 'FAILED' },
        }),
      ]);
      this.logger.error({
        event: 'Post operation failed',
        operationId: operation.id,
        kind: operation.kind,
        outcome: unknown ? 'unknown' : 'failed',
        error: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }
  private metadata(result: {
    model: string;
    promptVersion: string;
    durationMs: number;
    inputTokens?: number;
    outputTokens?: number;
    outcome: string;
  }) {
    return {
      model: result.model,
      promptVersion: result.promptVersion,
      durationMs: result.durationMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      outcome: result.outcome,
    };
  }
}
