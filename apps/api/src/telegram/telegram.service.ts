import { setTimeout as delay } from 'node:timers/promises';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Update } from 'telegraf/types';
import { Telegraf } from 'telegraf';

import { TELEGRAM_OPTIONS, type TelegramModuleOptions } from './telegram.options';

@Injectable()
export class TelegramService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private stopping = false;
  private readonly pollingAbort = new AbortController();
  public readonly instance: Telegraf;

  constructor(@Inject(TELEGRAM_OPTIONS) options: TelegramModuleOptions) {
    this.instance = new Telegraf(options.token);

    const callApi = this.telegram.callApi.bind(this.telegram);

    this.telegram.callApi = (method, payload, options) =>
      callApi(method, payload, {
        ...options,
        signal: options?.signal ?? (AbortSignal.timeout(30_000) as unknown as TelegramSignal),
      });
  }

  get telegram() {
    return this.instance.telegram;
  }

  onModuleInit() {
    this.instance.catch((error, ctx) => {
      this.logger.error({
        event: 'Telegram update failed',
        updateId: ctx.update.update_id,
        error: error instanceof Error ? error.name : 'UnknownError',
      });

      throw error;
    });
  }

  onApplicationBootstrap(): void {
    void this.poll().catch((error: unknown) => {
      if (!this.stopping) this.fatal(error);
    });
  }

  private async poll(): Promise<void> {
    this.instance.botInfo = await this.telegram.getMe();

    if (this.stopping) return;

    await this.telegram.deleteWebhook({ drop_pending_updates: false });
    this.logger.log('Telegram bot connected');

    let offset = 0;

    while (!this.stopping) {
      let updates: Update[];

      try {
        // Telegraf uses polyfill types; Node's native AbortSignal has the same cancellation contract.
        updates = await this.telegram.callApi(
          'getUpdates',
          {
            offset,
            timeout: 25,
            allowed_updates: ['channel_post', 'message'],
          },
          { signal: this.pollingAbort.signal as unknown as TelegramSignal },
        );
      } catch (error) {
        if (this.stopping) return;

        const status =
          error && typeof error === 'object' && 'code' in error ? error.code : undefined;

        if (
          (typeof status === 'number' && (status === 429 || status >= 500)) ||
          (error instanceof Error && ['FetchError', 'TimeoutError'].includes(error.name))
        ) {
          await delay(5000, undefined, { signal: this.pollingAbort.signal });

          continue;
        }

        throw error;
      }

      for (const update of updates) {
        if (this.stopping) return;

        await this.instance.handleUpdate(update);
        // Acknowledge only persisted updates. Telegraf.launch() also acknowledges a failed batch on shutdown.
        offset = update.update_id + 1;
      }
    }
  }

  fatal(error: unknown): void {
    this.logger.error({
      event: 'Telegram polling failed',
      error: error instanceof Error ? error.name : 'UnknownError',
    });
    process.exitCode = 1;
    process.kill(process.pid, 'SIGTERM');
  }

  onModuleDestroy() {
    this.stopping = true;
    this.pollingAbort.abort();
  }
}

type TelegramSignal = NonNullable<Parameters<Telegraf['telegram']['callApi']>[2]>['signal'];
