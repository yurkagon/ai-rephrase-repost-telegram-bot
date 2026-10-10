import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import express from 'express';

import { TelegramService } from '@/telegram/telegram.service';
import { AiService } from '@/ai/ai.service';
import { PostsService } from '@/api/posts/posts.service';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { ExceptionsFilter } from '@/common/filters/exceptions.filter';

async function main() {
  if (!process.env.TEST_DATABASE_URL || !process.env.TEST_REDIS_URL)
    throw new Error('Use explicitly isolated TEST_DATABASE_URL and TEST_REDIS_URL');
  if (!new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test'))
    throw new Error('Browser tests require a dedicated database ending in _test');

  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    REDIS_URL: process.env.TEST_REDIS_URL,
    JWT_SECRET: 'browser-test-secret',
    JWT_EXPIRATION_TIME: '15m',
    JWT_REFRESH_EXPIRATION_TIME: '7d',
    OPENAI_API_KEY: 'offline',
    TELEGRAM_BOT_API_TOKEN: 'offline',
    APP_URL: 'http://127.0.0.1:3007',
  });

  let link: (ctx: unknown) => Promise<void> = async () => {};
  const bot = {
    telegram: {
      getMe: () => Promise.resolve({ id: 1, username: 'browser_test_bot' }),
      getChat: (identifier: string) =>
        Promise.resolve({
          type: 'channel',
          id: identifier === '@source_test' ? -1001111 : -1002222,
          title: identifier === '@source_test' ? 'Tech Notes' : 'Daily Digest',
          username: identifier.slice(1),
        }),
      getChatMember: (_chat: unknown, id: number) =>
        Promise.resolve(
          id === 1 ? { status: 'administrator', can_post_messages: true } : { status: 'creator' },
        ),
      sendMessage: () => Promise.resolve({ message_id: 500 }),
      sendPhoto: () => Promise.resolve({ message_id: 501 }),
      sendVideo: () => Promise.resolve({ message_id: 502 }),
      sendMediaGroup: () => Promise.resolve([{ message_id: 503 }, { message_id: 504 }]),
    },
    instance: {
      start: (handler: typeof link) => {
        link = handler;
      },
      on: () => {},
    },
    fatal: (error: unknown) => {
      throw error;
    },
  };
  const { AppModule } = await import('@/app.module');
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TelegramService)
    .useValue(bot)
    .overrideProvider(AiService)
    .useValue({
      rewrite: (text: string, options: { language: string }) =>
        Promise.resolve({
          html:
            options.language === 'uk' && text.includes('released a new model')
              ? '<b>OpenAI</b> випустила нову модель. Запуск містить 12 покращень. Перегляньте анонс і перевірте зміни перед публікацією.'
              : text,
          model: 'offline-browser-fixture',
          promptVersion: 'test',
          durationMs: 1,
          inputTokens: 10,
          outputTokens: 5,
          outcome: 'success',
        }),
    })
    .compile();
  const app = module.createNestApplication();

  app.use(express.json());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ExceptionsFilter());
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  const adapter = app.getHttpAdapter();

  adapter.post('/__test/reset', async (_req: unknown, res: { json: (value: unknown) => void }) => {
    const db = app.get(PrismaService);

    await db.route.deleteMany();
    await db.channel.deleteMany();
    await db.user.deleteMany();
    res.json({ ok: true });
  });
  adapter.post(
    '/__test/link',
    async (req: { body: { token: string } }, res: { json: (value: unknown) => void }) => {
      await link({ startPayload: req.body.token, from: { id: 22 }, reply: async () => {} });
      res.json({ ok: true });
    },
  );
  adapter.post('/__test/ingest', async (_req: unknown, res: { json: (value: unknown) => void }) => {
    await app.get(PostsService).ingest({
      message_id: 1,
      date: 0,
      chat: { id: -1001111, type: 'channel', title: 'Tech Notes' },
      text: 'OpenAI released a new model. The launch includes 12 improvements. Explore the announcement and review the changes before sharing.',
      entities: [{ offset: 0, length: 6, type: 'bold' }],
    });
    res.json({ ok: true });
  });
  adapter.post('/__test/album', async (_req: unknown, res: { json: (value: unknown) => void }) => {
    const posts = app.get(PostsService);

    for (const id of [2, 3])
      await posts.ingest({
        message_id: id,
        date: 0,
        chat: { id: -1001111, type: 'channel', title: 'Tech Notes' },
        photo: [
          {
            file_id: `offline-photo-${id}`,
            file_unique_id: `offline-${id}`,
            width: 200,
            height: 200,
          },
        ],
        caption: `Offline media fixture ${id}`,
        media_group_id: 'offline-album',
      });

    const db = app.get(PrismaService);

    await db.post.updateMany({
      where: { sourceKey: 'album:offline-album' },
      data: { lastReceivedAt: new Date(Date.now() - 2000) },
    });
    await posts.recover();
    res.json({ ok: true });
  });
  // This entry point is test-only; the production bootstrap never imports it.
  await app.listen(3088, '127.0.0.1');
}

void main().catch(() => {
  process.exitCode = 1;
});
