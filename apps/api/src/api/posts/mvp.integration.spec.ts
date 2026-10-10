import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import { BullRegistrar, getQueueToken } from '@nestjs/bullmq';
import { z } from 'zod';
import type { Server } from 'node:http';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { Message } from 'telegraf/types';

import { RedisService } from '@/infra/redis/redis.service';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { TelegramService } from '@/telegram/telegram.service';
import { AiService, defaultRewriteOptions } from '@/ai/ai.service';
import { ChannelsService } from '@/api/channels/channels.service';
import { ExceptionsFilter } from '@/common/filters/exceptions.filter';

import { PostsService } from './posts.service';
import { PostsProcessor } from './posts.processor';

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

integration('MVP integration on isolated PostgreSQL + Redis', () => {
  let app: INestApplication;
  let db: PrismaService;
  let posts: PostsService;
  let processor: PostsProcessor;
  let access: string;
  let ownerId: string;
  let otherAccess: string;
  let routeId: string;
  let sourceId: string;
  let targetId: string;
  let start: (ctx: unknown) => Promise<void>;
  const rewrite = jest.fn();
  const sends = {
    sendMessage: jest.fn(),
    sendPhoto: jest.fn(),
    sendVideo: jest.fn(),
    sendMediaGroup: jest.fn<Promise<{ message_id: number }[]>, [string, { media: string }[]]>(),
  };
  const json = (value: unknown) =>
    z
      .object({
        id: z.string().optional(),
        accessToken: z.string().optional(),
        refreshToken: z.string().optional(),
        url: z.string().optional(),
        user: z.object({ id: z.string(), role: z.string() }).optional(),
        role: z.string().optional(),
        posts: z.array(z.unknown()).optional(),
      })
      .parse(value);
  const telegram = {
    ...sends,
    getMe: jest.fn().mockResolvedValue({ id: 1, username: 'mvp_bot' }),
    getChat: jest.fn((identifier: string) =>
      Promise.resolve({
        type: 'channel',
        id: identifier === '@source_1' ? -100111 : -100222,
        title: identifier,
        username: identifier.slice(1),
      }),
    ),
    getChatMember: jest.fn((_chat: number, user: number) =>
      Promise.resolve(
        user === 1
          ? { status: 'administrator', can_post_messages: true }
          : { status: 'administrator' },
      ),
    ),
  };
  const bot = {
    telegram,
    instance: {
      start: jest.fn((handler: typeof start) => {
        start = handler;
      }),
      on: jest.fn(),
    },
    fatal: jest.fn(),
  };
  const chat = { id: -100111, type: 'channel' as const, title: 'Source' };
  const message = (id: number, extra: Record<string, unknown> = {}): Message => ({
    message_id: id,
    date: 0,
    chat,
    text: '<Hello>',
    ...extra,
  });
  const photo = (id: number, album?: string, caption = 'Caption'): Message => ({
    message_id: id,
    date: 0,
    chat,
    photo: [{ file_id: `photo-${id}`, file_unique_id: `f${id}`, width: 10, height: 10 }],
    ...(album ? { media_group_id: album } : {}),
    caption,
  });

  async function register(email: string) {
    await request(app.getHttpServer() as Server)
      .post('/api/auth/register')
      .send({
        email,
        firstName: 'Ada',
        lastName: 'Editor',
        password: 'correct-password',
        confirmPassword: 'correct-password',
      })
      .expect(201);

    return request(app.getHttpServer() as Server)
      .post('/api/auth/login')
      .send({ email, password: 'correct-password' })
      .expect(201);
  }

  const http = () => request(app.getHttpServer() as Server);
  const authorized = (endpoint: string) => http().get(endpoint).auth(access, { type: 'bearer' });

  beforeAll(async () => {
    if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith('_test'))
      throw new Error('Use an isolated database ending in _test');

    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://127.0.0.1:56390';
    Object.assign(process.env, {
      NODE_ENV: 'test',
      JWT_SECRET: 'isolated-test-secret',
      JWT_EXPIRATION_TIME: '15m',
      JWT_REFRESH_EXPIRATION_TIME: '7d',
      TELEGRAM_BOT_API_TOKEN: 'offline-test',
      OPENAI_API_KEY: 'offline-test',
      APP_URL: 'http://localhost:3001',
    });

    const { AppModule } = await import('@/app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TelegramService)
      .useValue(bot)
      .overrideProvider(AiService)
      .useValue({ rewrite })
      .overrideProvider(PostsProcessor)
      .useFactory({
        factory: (
          db: PrismaService,
          ai: AiService,
          bot: TelegramService,
          channels: ChannelsService,
        ) => {
          const processor = new PostsProcessor(db, ai, bot, channels);

          processor.beforeApplicationShutdown = () => Promise.resolve();

          return processor;
        },
        inject: [PrismaService, AiService, TelegramService, ChannelsService],
      })
      .overrideProvider(BullRegistrar)
      .useValue({ register: jest.fn() })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new ExceptionsFilter());
    await app.init();
    db = app.get(PrismaService);
    posts = app.get(PostsService);
    processor = app.get(PostsProcessor);

    const suffix = randomUUID().slice(0, 8);
    const login = await register(`owner-${suffix}@example.com`);

    access = json(login.body).accessToken!;
    ownerId = json(login.body).user!.id;

    const other = await register(`other-${suffix}@example.com`);

    otherAccess = json(other.body).accessToken!;

    const connected = await http()
      .post('/api/channels/connect')
      .auth(access, { type: 'bearer' })
      .expect(201);

    await start({
      startPayload: new URL(json(connected.body).url!).searchParams.get('start'),
      from: { id: 22 },
      reply: jest.fn(),
    });

    const source = await http()
      .post('/api/channels')
      .auth(access, { type: 'bearer' })
      .send({ identifier: '@source_1' })
      .expect(201);

    sourceId = json(source.body).id!;

    const target = await http()
      .post('/api/channels')
      .auth(access, { type: 'bearer' })
      .send({ identifier: '@target_1' })
      .expect(201);

    targetId = json(target.body).id!;

    const route = await http()
      .post('/api/channels/routes')
      .auth(access, { type: 'bearer' })
      .send({ sourceId, targetId, name: 'Editorial', options: defaultRewriteOptions })
      .expect(201);

    routeId = json(route.body).id!;
  }, 30000);
  beforeEach(() => {
    rewrite.mockReset().mockImplementation((text: string) =>
      Promise.resolve({
        html: text.trim().length < 2 ? '' : text,
        model: 'offline',
        promptVersion: 'test',
        durationMs: 2,
        inputTokens: 5,
        outputTokens: 3,
        outcome: text.trim().length < 2 ? 'skipped' : 'success',
      }),
    );

    for (const send of [sends.sendMessage, sends.sendPhoto, sends.sendVideo])
      send.mockReset().mockResolvedValue({ message_id: 99 });

    sends.sendMediaGroup.mockReset().mockResolvedValue([{ message_id: 99 }, { message_id: 100 }]);
  });
  afterAll(async () => {
    if (db) {
      await db.route.deleteMany({
        where: {
          ownerId: {
            in: [
              ownerId,
              (await db.user.findFirst({ where: { email: { startsWith: 'other-' } } }))?.id ?? '',
            ],
          },
        },
      });
      await db.channel.deleteMany({ where: { ownerId } });
      await db.user.deleteMany({ where: { id: ownerId } });
    }

    await app?.close();
  });
  async function ingestAndFind(msg: Message) {
    await posts.ingest(msg);

    return db.post.findFirstOrThrow({ where: { routeId, sourceKey: `message:${msg.message_id}` } });
  }
  async function generate(id: string, revision = 0) {
    const operation = await posts.generate(ownerId, id, { revision });

    await processor.process({ data: { id: operation.id } } as Parameters<
      PostsProcessor['process']
    >[0]);

    return db.post.findUniqueOrThrow({ where: { id }, include: { revisions: true } });
  }
  it('forces ordinary role and rejects public role injection', async () => {
    expect(json((await authorized('/api/auth/me')).body).role).toBe('USER');
    await http()
      .post('/api/auth/register')
      .send({
        email: 'invalid@example.com',
        firstName: 'Ada',
        lastName: 'Admin',
        password: '12345678',
        confirmPassword: '12345678',
        role: 'SUPERADMIN',
      })
      .expect(400);
    await authorized('/api/user').expect(403);
  });
  it('rejects expired/used Telegram links and other-account ownership claims', async () => {
    const before = (await db.user.findUniqueOrThrow({ where: { id: ownerId } })).telegramId;

    await start({ startPayload: 'invalid', from: { id: 555 }, reply: jest.fn() });
    expect((await db.user.findUniqueOrThrow({ where: { id: ownerId } })).telegramId).toBe(before);
    await http()
      .post('/api/channels')
      .auth(otherAccess, { type: 'bearer' })
      .send({ identifier: '@source_1' })
      .expect(400);
  });
  it('rejects self-routes and reverse cycles', async () => {
    for (const [source, target] of [
      [sourceId, sourceId],
      [targetId, sourceId],
    ])
      await http()
        .post('/api/channels/routes')
        .auth(access, { type: 'bearer' })
        .send({
          sourceId: source,
          targetId: target,
          name: 'Cycle',
          options: defaultRewriteOptions,
        })
        .expect(400);
  });
  it('collects without AI, deduplicates updates and skips destination channel', async () => {
    const post = await ingestAndFind(message(10));

    await posts.ingest(message(10));
    expect(await db.post.count({ where: { routeId, sourceKey: 'message:10' } })).toBe(1);
    await posts.ingest({ ...message(11), chat: { ...chat, id: -100222 } });
    expect(await db.post.count({ where: { routeId, sourceKey: 'message:11' } })).toBe(0);
    expect(rewrite).not.toHaveBeenCalled();
    expect(sends.sendMessage).not.toHaveBeenCalled();
    expect(post.originalHtml).toBe('&lt;Hello&gt;');
  });
  it('isolates posts, media, operations and metrics by account', async () => {
    const post = await ingestAndFind(photo(20));
    const operation = await posts.generate(ownerId, post.id, { revision: 0 });

    await http().get(`/api/posts/${post.id}`).auth(otherAccess, { type: 'bearer' }).expect(404);

    const media = await db.postMedia.findFirstOrThrow({ where: { postId: post.id } });

    await http()
      .get(`/api/posts/${post.id}/media/${media.id}`)
      .auth(otherAccess, { type: 'bearer' })
      .expect(404);
    await http()
      .get(`/api/posts/operations/${operation.id}`)
      .auth(otherAccess, { type: 'bearer' })
      .expect(404);
    expect(
      json((await http().get('/api/posts').auth(otherAccess, { type: 'bearer' })).body).posts,
    ).toHaveLength(0);
  });
  it('makes concurrent generation and publication idempotent and pins revision', async () => {
    const post = await ingestAndFind(message(30));
    const [a, b] = await Promise.all([
      posts.generate(ownerId, post.id, { revision: 0 }),
      posts.generate(ownerId, post.id, { revision: 0 }),
    ]);

    expect(a.id).toBe(b.id);
    await processor.process({ data: { id: a.id } } as Parameters<PostsProcessor['process']>[0]);

    const [c, d] = await Promise.all([
      posts.publish(ownerId, post.id, 1),
      posts.publish(ownerId, post.id, 1),
    ]);

    expect(c.id).toBe(d.id);
    await processor.process({ data: { id: c.id } } as Parameters<PostsProcessor['process']>[0]);
    await processor.process({ data: { id: c.id } } as Parameters<PostsProcessor['process']>[0]);
    expect(sends.sendMessage).toHaveBeenCalledTimes(1);
    expect((await db.post.findUniqueOrThrow({ where: { id: post.id } })).status).toBe('PUBLISHED');
  });
  it.each(['text', 'photo', 'video'])('publishes %s only after review', async (type) => {
    const id = type === 'text' ? 40 : type === 'photo' ? 41 : 42;
    const msg =
      type === 'text'
        ? message(id)
        : type === 'photo'
          ? photo(id)
          : ({
              message_id: id,
              date: 0,
              chat,
              video: { file_id: 'video', file_unique_id: 'v', width: 10, height: 10, duration: 1 },
              caption: 'Caption',
            } as Message);
    const post = await ingestAndFind(msg);
    const draft = await generate(post.id);

    expect(draft.status).toBe('DRAFT');

    for (const send of Object.values(sends)) expect(send).not.toHaveBeenCalled();

    const operation = await posts.publish(ownerId, post.id, 1);

    await processor.process({ data: { id: operation.id } } as Parameters<
      PostsProcessor['process']
    >[0]);
    expect(
      type === 'text' ? sends.sendMessage : type === 'photo' ? sends.sendPhoto : sends.sendVideo,
    ).toHaveBeenCalledTimes(1);
  });
  it.each(['text', 'photo', 'video'])(
    'blocks publication after AI failure for %s',
    async (type) => {
      const id = type === 'text' ? 50 : type === 'photo' ? 51 : 52;
      const msg =
        type === 'text'
          ? message(id)
          : type === 'photo'
            ? photo(id)
            : ({
                message_id: id,
                date: 0,
                chat,
                video: {
                  file_id: 'video',
                  file_unique_id: 'v',
                  width: 10,
                  height: 10,
                  duration: 1,
                },
                caption: 'Caption',
              } as Message);
      const post = await ingestAndFind(msg);

      rewrite.mockRejectedValueOnce(new Error('provider failure'));
      expect((await generate(post.id)).status).toBe('FAILED');
      await expect(posts.publish(ownerId, post.id, 1)).rejects.toThrow();

      for (const send of Object.values(sends)) expect(send).not.toHaveBeenCalled();
    },
  );
  it('publishes captionless media without an AI provider call', async () => {
    const post = await ingestAndFind(photo(60, undefined, ''));

    await generate(post.id);
    expect(rewrite).toHaveBeenCalledWith('', expect.any(Object));
    expect(await db.aiRun.count({ where: { postId: post.id } })).toBe(0);

    const operation = await posts.publish(ownerId, post.id, 1);

    await processor.process({ data: { id: operation.id } } as Parameters<
      PostsProcessor['process']
    >[0]);
    expect(sends.sendPhoto).toHaveBeenCalled();
  });
  async function album(name: string, ids: number[]) {
    for (const id of ids) await posts.ingest(photo(id, name));

    const post = await db.post.findFirstOrThrow({ where: { routeId, sourceKey: `album:${name}` } });

    await db.post.update({
      where: { id: post.id },
      data: { lastReceivedAt: new Date(Date.now() - 2000) },
    });
    await posts.recover();

    return post;
  }
  it('sorts and deduplicates albums, finalizes once, and ignores late updates', async () => {
    const post = await album('ordered', [72, 71, 72]);
    const media = await db.postMedia.findMany({
      where: { postId: post.id },
      orderBy: { messageId: 'asc' },
    });

    expect(media.map((m) => m.messageId)).toEqual([71, 72]);
    await posts.ingest(photo(73, 'ordered'));
    expect(await db.postMedia.count({ where: { postId: post.id } })).toBe(2);
    await generate(post.id);

    const operation = await posts.publish(ownerId, post.id, 1);

    await processor.process({ data: { id: operation.id } } as Parameters<
      PostsProcessor['process']
    >[0]);
    expect(sends.sendMediaGroup.mock.calls[0][1].map((m: { media: string }) => m.media)).toEqual([
      'photo-71',
      'photo-72',
    ]);
  });
  it('blocks the whole album if any caption fails', async () => {
    const post = await album('failure', [81, 82]);

    rewrite
      .mockResolvedValueOnce({
        html: 'First',
        model: 'offline',
        promptVersion: 'test',
        durationMs: 1,
        outcome: 'success',
      })
      .mockRejectedValueOnce(new Error('second caption'));
    expect((await generate(post.id)).status).toBe('FAILED');
    expect(sends.sendMediaGroup).not.toHaveBeenCalled();
  });
  it.each([1, 11])('rejects an album with %i unique media before AI', async (count) => {
    const post = await album(
      `invalid-${count}`,
      Array.from({ length: count }, (_, i) => 100 + count * 20 + i),
    );

    expect((await db.post.findUniqueOrThrow({ where: { id: post.id } })).status).toBe('SKIPPED');
    await expect(posts.generate(ownerId, post.id, { revision: 0 })).rejects.toThrow();
    expect(rewrite).not.toHaveBeenCalled();
  });
  it('records ambiguous Telegram sends and refuses blind retries', async () => {
    const post = await ingestAndFind(message(400));

    await generate(post.id);
    sends.sendMessage.mockRejectedValueOnce(new Error('timeout'));

    const operation = await posts.publish(ownerId, post.id, 1);

    await processor.process({ data: { id: operation.id } } as Parameters<
      PostsProcessor['process']
    >[0]);
    expect((await db.post.findUniqueOrThrow({ where: { id: post.id } })).status).toBe(
      'PUBLICATION_UNKNOWN',
    );
    await processor.process({ data: { id: operation.id } } as Parameters<
      PostsProcessor['process']
    >[0]);
    expect(sends.sendMessage).toHaveBeenCalledTimes(1);
    await posts.resolve(ownerId, post.id, false);
    expect((await db.post.findUniqueOrThrow({ where: { id: post.id } })).revision).toBe(2);
  });
  it('generates repeated album drafts without daily allowances and reports usage metrics', async () => {
    const post = await album('repeated-drafts', [501, 502]);

    for (let revision = 0; revision < 21; revision++) {
      expect((await generate(post.id, revision)).status).toBe('DRAFT');
    }

    expect(rewrite).toHaveBeenCalledTimes(42);
    expect(await db.aiRun.count({ where: { postId: post.id } })).toBe(42);
    expect(Object.keys(await posts.metrics(ownerId)).sort()).toEqual([
      'averageDurationMs',
      'averageRating',
      'calls',
      'failures',
      'inputTokens',
      'outputTokens',
    ]);
  }, 15_000);

  it('blocks stale edits and unsafe HTML before saving', async () => {
    const post = await ingestAndFind(message(600));

    await posts.edit(ownerId, post.id, { revision: 0, html: 'Valid', captions: [] });
    await expect(
      posts.edit(ownerId, post.id, { revision: 0, html: 'Lost update', captions: [] }),
    ).rejects.toThrow('changed');
    await expect(
      posts.edit(ownerId, post.id, { revision: 1, html: '<script>bad</script>', captions: [] }),
    ).rejects.toThrow('HTML');
  });
  it('uses stateless JWT refresh, checks token types and disallows foreign Origin', async () => {
    const email = (await db.user.findUniqueOrThrow({ where: { id: ownerId } })).email;
    const login = await http()
      .post('/api/auth/login')
      .send({ email, password: 'correct-password' })
      .expect(201);
    const tokens = json(login.body);

    expect(login.headers['set-cookie']).toBeUndefined();
    expect(tokens.user!.id).toBe(ownerId);
    await http().post('/api/auth/refresh').send({ refreshToken: tokens.refreshToken }).expect(201);
    await http().post('/api/auth/refresh').send({ refreshToken: tokens.refreshToken }).expect(201);
    await http().post('/api/auth/refresh').send({ refreshToken: tokens.accessToken }).expect(401);
    await http().get('/api/auth/me').auth(tokens.refreshToken!, { type: 'bearer' }).expect(401);
    await http().post('/api/auth/refresh').send({}).expect(400);
    await http()
      .post('/api/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .set('Origin', 'https://attacker.example')
      .expect(403);
    await http().post('/api/auth/logout').expect(404);
  });
  it('stops receiving source posts when the linked account loses admin rights', async () => {
    telegram.getChatMember.mockResolvedValueOnce({ status: 'left' });
    await posts.ingest(message(701));
    expect(await db.post.count({ where: { routeId, sourceKey: 'message:701' } })).toBe(0);
  });
  it('records unsafe AI HTML as a failed run without saving a draft', async () => {
    const post = await ingestAndFind(message(702));

    rewrite.mockResolvedValueOnce({
      html: '<img src=x>',
      model: 'offline',
      promptVersion: 'test',
      durationMs: 1,
      outcome: 'success',
    });
    expect((await generate(post.id)).status).toBe('FAILED');
    expect(await db.aiRun.findFirst({ where: { postId: post.id } })).toMatchObject({
      outcome: 'invalid_html',
    });
    expect(await db.postRevision.count({ where: { postId: post.id } })).toBe(0);
  });
  it('recovers durable albums and pending intents after a Redis dispatch failure', async () => {
    const post = await ingestAndFind(message(703));
    const operation = await posts.generate(ownerId, post.id, { revision: 0 });
    const queue = app.get<Queue>(getQueueToken('posts'));
    const dispatch = jest.spyOn(queue, 'add').mockRejectedValue(new Error('Redis unavailable'));

    await posts.recover();
    expect((await db.operation.findUniqueOrThrow({ where: { id: operation.id } })).status).toBe(
      'PENDING',
    );
    dispatch.mockRestore();
    await posts.recover();
    expect(await queue.getJob(operation.id)).toBeDefined();
    await posts.ingest(photo(704, 'restart'));
    await posts.ingest(photo(705, 'restart'));

    const album = await db.post.findFirstOrThrow({
      where: { routeId, sourceKey: 'album:restart' },
    });

    await db.post.update({
      where: { id: album.id },
      data: { lastReceivedAt: new Date(Date.now() - 2000) },
    });

    const restarted = new PostsService(
      db,
      bot as unknown as TelegramService,
      queue,
      app.get(BullRegistrar),
      app.get(ChannelsService),
    );

    await restarted.onModuleInit();
    restarted.onModuleDestroy();
    expect((await db.post.findUniqueOrThrow({ where: { id: album.id } })).status).toBe('INBOX');
    expect(await queue.getJob(operation.id)).toBeDefined();
  });
  it('marks an interrupted publication unknown on restart instead of sending again', async () => {
    const post = await ingestAndFind(message(706));

    await posts.edit(ownerId, post.id, { revision: 0, html: 'Saved', captions: [] });

    const operation = await posts.publish(ownerId, post.id, 1);

    await db.operation.update({ where: { id: operation.id }, data: { status: 'RUNNING' } });

    const restarted = new PostsService(
      db,
      bot as unknown as TelegramService,
      app.get(getQueueToken('posts')),
      app.get(BullRegistrar),
      app.get(ChannelsService),
    );

    await restarted.onModuleInit();
    restarted.onModuleDestroy();
    expect((await db.post.findUniqueOrThrow({ where: { id: post.id } })).status).toBe(
      'PUBLICATION_UNKNOWN',
    );
    await processor.process({ data: { id: operation.id } } as Parameters<
      PostsProcessor['process']
    >[0]);
    expect(sends.sendMessage).not.toHaveBeenCalled();
  });
  it('does not save or publish an AI result that completes during shutdown', async () => {
    const post = await ingestAndFind(message(707));
    const operation = await posts.generate(ownerId, post.id, { revision: 0 });
    let finish!: (value: unknown) => void;

    rewrite.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );

    const stopping = new PostsProcessor(
      db,
      app.get(AiService),
      bot as unknown as TelegramService,
      app.get(ChannelsService),
    );
    const running = stopping.process({ data: { id: operation.id } } as Parameters<
      PostsProcessor['process']
    >[0]);

    while (!finish) await new Promise((resolve) => setTimeout(resolve, 5));

    stopping.onModuleDestroy();
    finish({
      html: 'Done',
      model: 'offline',
      promptVersion: 'test',
      durationMs: 1,
      outcome: 'success',
    });
    await running;
    expect((await db.post.findUniqueOrThrow({ where: { id: post.id } })).status).toBe('FAILED');
    expect(await db.postRevision.count({ where: { postId: post.id } })).toBe(0);
    expect(sends.sendMessage).not.toHaveBeenCalled();
  });
  it('changes the password without server-side token sessions', async () => {
    const email = `password-${randomUUID()}@example.com`;
    const login = await register(email);
    const token = json(login.body).accessToken!;
    const refreshToken = json(login.body).refreshToken!;

    await http()
      .patch('/api/user/me/password')
      .auth(token, { type: 'bearer' })
      .send({
        currentPassword: 'correct-password',
        newPassword: 'new-password',
        confirmPassword: 'new-password',
      })
      .expect(204);
    await http().get('/api/auth/me').auth(token, { type: 'bearer' }).expect(200);
    await http().post('/api/auth/refresh').send({ refreshToken }).expect(201);
    await http().post('/api/auth/login').send({ email, password: 'correct-password' }).expect(401);
    await http().post('/api/auth/login').send({ email, password: 'new-password' }).expect(201);
  });
  it.each(['verify', 'resend', 'forgot', 'reset'])(
    'removes the email endpoint %s',
    async (endpoint) => {
      await http().post(`/api/auth/${endpoint}`).send({}).expect(404);
    },
  );
  it('rate-limits public auth by action even when URL casing changes', async () => {
    const redis = app.get(RedisService).client;
    const keys = await redis.keys('auth:limit:*:login');

    if (keys.length) await redis.del(...keys);

    for (let i = 0; i < 20; i++)
      await http()
        .post(i % 2 ? '/api/AUTH/LOGIN' : '/api/auth/login')
        .send({ email: 'not-an-email' })
        .expect(400);

    await http()
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong' })
      .expect(429);
  });
});
