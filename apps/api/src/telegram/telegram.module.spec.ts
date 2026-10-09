import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Telegram } from 'telegraf';
import { TextRewriterService } from '@/ai/text-rewriter.service';
import { TelegramModule } from './telegram.module';
import { TelegramService } from './telegram.service';

async function compile(
  credentials: Record<string, string | undefined> = {
    TELEGRAM_BOT_API_TOKEN: 'test-token',
    OPENAI_API_KEY: 'test-key',
  },
) {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        skipProcessEnv: true,
        load: [
          () => ({ LLM_MODEL: 'gpt-6-luna', TARGET_CHANNEL: '@test_yuragon', ...credentials }),
        ],
      }),
      TelegramModule,
    ],
  }).compile();
}

let api: jest.SpyInstance;

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
  jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected external request'));
  api = jest
    .spyOn(Telegram.prototype, 'callApi')
    .mockRejectedValue(new Error('Unexpected Telegram request'));
});
afterEach(() => jest.restoreAllMocks());

it('resolves the Telegram and AI graph without auth, users, Prisma or Redis', async () => {
  const module = await compile();
  expect(module.get(TelegramService)).toBeInstanceOf(TelegramService);
  expect(module.get(TextRewriterService)).toBeInstanceOf(TextRewriterService);
  await module.close();
  expect(globalThis.fetch).not.toHaveBeenCalled();
  expect(api).not.toHaveBeenCalled();
});

it.each([
  { TELEGRAM_BOT_API_TOKEN: undefined, OPENAI_API_KEY: 'test-key' },
  { TELEGRAM_BOT_API_TOKEN: 'test-token', OPENAI_API_KEY: undefined },
])('rejects missing credentials during DI initialization', async (credentials) => {
  await expect(compile(credentials)).rejects.toThrow(/(TELEGRAM_BOT_API_TOKEN|OPENAI_API_KEY)/);
});

it('listens for HTTP while polling is running and stops the bot when the app closes', async () => {
  const module = await compile();
  const bot = module.get(TelegramService);
  let finish!: () => void;
  const polling = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const launch = jest.spyOn(bot.instance, 'launch').mockReturnValue(polling);
  const stop = jest.spyOn(bot.instance, 'stop').mockImplementation(() => finish());
  const app = module.createNestApplication();
  app.useLogger(false);
  try {
    await app.listen(0, '127.0.0.1');
    expect(launch).toHaveBeenCalledTimes(1);
    expect(app.getHttpServer()).toHaveProperty('listening', true);
  } finally {
    await app.close();
  }
  expect(stop).toHaveBeenCalledTimes(1);
});
