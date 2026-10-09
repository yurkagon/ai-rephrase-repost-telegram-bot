import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '@/config/env.schema';
import { TextRewriterService } from '@/ai/text-rewriter.service';
import { Telegraf } from 'telegraf';
import type { Message, InputMediaPhoto, InputMediaVideo } from 'telegraf/types';
import { debounce } from 'lodash';
import type { DebouncedFunc } from 'lodash';
import { toHTML } from '@telegraf/entity';
import { TELEGRAM_OPTIONS, type TelegramModuleOptions } from './telegram.options';

type AlbumMedia = InputMediaPhoto | InputMediaVideo;
type MediaMessage = Message.PhotoMessage | Message.VideoMessage;

@Injectable()
export class TelegramService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TelegramService.name);
  private readonly targetChannel: string;
  private stopping = false;
  public readonly instance: Telegraf;
  // shortcut: completed album IDs stay in memory until restart; replace with persistent deduplication when storage is added.
  private readonly mediaGroupStore = new Map<
    string,
    {
      data: AlbumMedia[];
      publish: DebouncedFunc<() => Promise<void>>;
      isUploadingFinished: boolean;
    }
  >();

  constructor(
    config: ConfigService<Environment>,
    private readonly rewriter: TextRewriterService,
    @Inject(TELEGRAM_OPTIONS) options: TelegramModuleOptions,
  ) {
    this.instance = new Telegraf(options.token);
    this.targetChannel = config.getOrThrow('TARGET_CHANNEL', { infer: true });
  }

  public onModuleInit(): void {
    this.instance.catch((error, ctx) => {
      this.logger.error({
        event: 'Telegram update failed',
        updateId: ctx.update.update_id,
        error: error instanceof Error ? error.name : 'UnknownError',
      });
    });

    this.instance.start((ctx) => ctx.reply('Welcome'));

    this.instance.on('channel_post', async (ctx) => {
      if (
        this.stopping ||
        `@${ctx.channelPost.chat.username}` === this.targetChannel ||
        String(ctx.channelPost.chat.id) === this.targetChannel
      )
        return;
      await this.copyMessage(ctx.channelPost);
    });
  }

  public get telegram() {
    return this.instance.telegram;
  }

  public onApplicationBootstrap(): void {
    void this.instance
      .launch(() => {
        if (this.stopping) throw new Error('Telegram startup cancelled by shutdown.');
        this.logger.log('Telegram bot connected');
      })
      .catch((error: unknown) => {
        if (this.stopping) return;
        this.logger.error({
          event: 'Telegram polling failed',
          error: error instanceof Error ? error.name : 'UnknownError',
        });
        process.exitCode = 1;
        process.kill(process.pid, 'SIGTERM');
      });
  }

  public onApplicationShutdown(): void {
    this.stopping = true;
    for (const group of this.mediaGroupStore.values()) group.publish.cancel();
    try {
      this.instance.stop('Application shutdown');
    } catch {
      // Telegraf throws when shutdown happens before polling has started.
      this.logger.debug('Telegram polling was not running');
    }
  }

  public async copyMessage(message: Message): Promise<void> {
    if (this.stopping) return;
    const chatId = this.targetChannel;
    if ('photo' in message || 'video' in message) {
      if (message.media_group_id) {
        this.copyMediaGroupMessage(message);
        return;
      }

      const html = toHTML(message);
      const caption = await this.rewriter.rewriteTelegramHTML(html);
      if (this.stopping) return;
      const options = { caption, parse_mode: 'HTML' as const };
      if ('photo' in message) {
        await this.telegram.sendPhoto(chatId, this.photoFileId(message), options);
      } else {
        await this.telegram.sendVideo(chatId, message.video.file_id, options);
      }
    } else if ('text' in message) {
      const html = toHTML(message);
      const text = await this.rewriter.rewriteTelegramHTML(html);
      if (text && !this.stopping)
        await this.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' });
    }
  }

  private photoFileId(message: Message.PhotoMessage): string {
    const photo = message.photo.at(-1);
    if (!photo) throw new Error('Photo message contains no photos.');
    return photo.file_id;
  }

  private copyMediaGroupMessage(message: MediaMessage): void {
    const chatId = this.targetChannel;
    const key = `${message.chat.id}:${chatId}:${message.media_group_id}`;
    let group = this.mediaGroupStore.get(key);
    if (!group) {
      group = {
        data: [],
        isUploadingFinished: false,
        publish: debounce(async () => {
          const album = this.mediaGroupStore.get(key);
          if (this.stopping || !album || album.isUploadingFinished) return;
          album.isUploadingFinished = true;
          try {
            const data = await Promise.all(
              album.data.map(async (item) => ({
                ...item,
                caption: await this.rewriter.rewriteTelegramHTML(item.caption ?? ''),
              })),
            );
            if (!this.stopping) await this.telegram.sendMediaGroup(chatId, data);
          } catch (error) {
            this.logger.error({
              event: 'Telegram album skipped',
              mediaGroupId: message.media_group_id,
              chatId,
              error: error instanceof Error ? error.name : 'UnknownError',
            });
          } finally {
            album.data = [];
          }
        }, 1000),
      };
      this.mediaGroupStore.set(key, group);
    }
    if (group.isUploadingFinished) return;

    const caption = { caption: toHTML(message), parse_mode: 'HTML' as const };
    group.data.push(
      'photo' in message
        ? { type: 'photo', media: this.photoFileId(message), ...caption }
        : { type: 'video', media: message.video.file_id, ...caption },
    );
    void group.publish();
  }
}
