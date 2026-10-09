import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Telegram } from 'telegraf';
import type { Message } from 'telegraf/types';
import { AiService } from '@/ai/ai.service';
import { TelegramService } from './telegram.service';
import { TELEGRAM_OPTIONS } from './telegram.options';

const common = {
  message_id: 1,
  date: 0,
  chat: { id: -100, type: 'channel', title: 'Source', username: 'source' },
} as const;
const botInfo = {
  id: 1,
  is_bot: true,
  first_name: 'Bot',
  username: 'bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
} as const;
function text() {
  return { ...common, text: 'Hello', entities: [{ type: 'bold' as const, offset: 0, length: 5 }] };
}
function photo(caption?: string, media_group_id?: string): Message.PhotoMessage {
  return {
    ...common,
    caption,
    media_group_id,
    photo: [
      { file_id: 'small', file_unique_id: 's', width: 10, height: 10 },
      { file_id: 'large', file_unique_id: 'l', width: 100, height: 100 },
    ],
  };
}
function video(caption?: string, media_group_id?: string): Message.VideoMessage {
  return {
    ...common,
    message_id: 2,
    caption,
    media_group_id,
    video: { file_id: 'video', file_unique_id: 'v', width: 100, height: 100, duration: 1 },
  };
}

async function setup(targetChannel = '@target', realRewriter = false) {
  const rewrite = jest.fn().mockResolvedValue('<b>Привіт</b>');
  const rewriter = realRewriter
    ? new AiService(new ConfigService({ OPENAI_API_KEY: 'test-key', LLM_MODEL: 'gpt-6-luna' }))
    : { rewrite: rewrite };
  const module = await Test.createTestingModule({
    providers: [
      TelegramService,
      { provide: TELEGRAM_OPTIONS, useValue: { token: 'test-token' } },
      {
        provide: ConfigService,
        useValue: new ConfigService({
          TARGET_CHANNEL: targetChannel,
        }),
      },
      { provide: AiService, useValue: rewriter },
    ],
  }).compile();
  const bot = module.get(TelegramService);
  bot.instance.botInfo = botInfo;
  bot.onModuleInit();
  const sendText = jest.spyOn(bot.telegram, 'sendMessage').mockResolvedValue(text());
  const sendPhoto = jest.spyOn(bot.telegram, 'sendPhoto').mockResolvedValue(photo());
  const sendVideo = jest.spyOn(bot.telegram, 'sendVideo').mockResolvedValue(video());
  const sendAlbum = jest.spyOn(bot.telegram, 'sendMediaGroup').mockResolvedValue([]);
  return { bot, rewrite, sendText, sendPhoto, sendVideo, sendAlbum };
}

const initialExitCode = process.exitCode;
let errors: jest.SpyInstance;
let kill: jest.SpyInstance;
beforeEach(() => {
  jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected external request'));
  jest
    .spyOn(Telegram.prototype, 'callApi')
    .mockRejectedValue(new Error('Unexpected Telegram request'));
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  errors = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
  kill = jest.spyOn(process, 'kill').mockReturnValue(true);
});
afterEach(() => {
  process.exitCode = initialExitCode;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('publishes rewritten HTML for text, photos and videos', async () => {
  const { bot, rewrite, sendText, sendPhoto, sendVideo } = await setup();
  for (const message of [text(), photo('Hello'), video('Hello')]) await bot.copyMessage(message);
  expect(rewrite.mock.calls).toEqual([['<b>Hello</b>'], ['Hello'], ['Hello']]);
  expect(sendText).toHaveBeenCalledWith('@target', '<b>Привіт</b>', { parse_mode: 'HTML' });
  expect(sendPhoto).toHaveBeenCalledWith('@target', 'large', {
    caption: '<b>Привіт</b>',
    parse_mode: 'HTML',
  });
  expect(sendVideo).toHaveBeenCalledWith('@target', 'video', {
    caption: '<b>Привіт</b>',
    parse_mode: 'HTML',
  });
});

it('AI failures prevent publishing text, photos and videos', async () => {
  const { bot, rewrite, sendText, sendPhoto, sendVideo } = await setup();
  const error = new Error('AI unavailable');
  rewrite.mockRejectedValue(error);
  for (const message of [text(), photo('Hello'), video('Hello')])
    await expect(bot.copyMessage(message)).rejects.toBe(error);
  expect(sendText).not.toHaveBeenCalled();
  expect(sendPhoto).not.toHaveBeenCalled();
  expect(sendVideo).not.toHaveBeenCalled();
});

it('publishes media without captions without an AI request', async () => {
  const { bot, sendPhoto, sendVideo } = await setup('@target', true);
  for (const message of [photo(), video()]) await bot.copyMessage(message);
  expect(globalThis.fetch).not.toHaveBeenCalled();
  expect(sendPhoto).toHaveBeenCalledWith('@target', 'large', { caption: '', parse_mode: 'HTML' });
  expect(sendVideo).toHaveBeenCalledWith('@target', 'video', { caption: '', parse_mode: 'HTML' });
});

it('prepares every album caption before publishing once', async () => {
  jest.useFakeTimers();
  const { bot, rewrite, sendAlbum } = await setup();
  rewrite.mockImplementation((html: string) => {
    expect(sendAlbum).not.toHaveBeenCalled();
    return Promise.resolve(`Переклад ${html}`);
  });
  await bot.copyMessage(photo('First', 'album'));
  await bot.copyMessage(video('Second', 'album'));
  expect(sendAlbum).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(1000);
  expect(rewrite.mock.calls).toEqual([['First'], ['Second']]);
  expect(sendAlbum).toHaveBeenCalledWith('@target', [
    { type: 'photo', media: 'large', caption: 'Переклад First', parse_mode: 'HTML' },
    { type: 'video', media: 'video', caption: 'Переклад Second', parse_mode: 'HTML' },
  ]);
  expect(bot['pendingAlbums'].size).toBe(0);
  expect(bot['processedAlbumIds'].has('-100:@target:album')).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
  await bot.copyMessage(video('Second', 'album'));
  await jest.advanceTimersByTimeAsync(1000);
  expect(sendAlbum).toHaveBeenCalledTimes(1);
});

it('skips the whole album if one caption fails and logs no content', async () => {
  jest.useFakeTimers();
  const { bot, rewrite, sendAlbum } = await setup();
  rewrite
    .mockResolvedValueOnce('Переклад')
    .mockRejectedValueOnce(new Error('Private provider details'));
  await bot.copyMessage(photo('Hello', 'album'));
  await bot.copyMessage(video('Private caption', 'album'));
  await jest.advanceTimersByTimeAsync(1000);
  expect(sendAlbum).not.toHaveBeenCalled();
  expect(errors).toHaveBeenCalledWith(expect.objectContaining({ event: 'Telegram album skipped' }));
  expect(JSON.stringify(errors.mock.calls)).not.toContain('Private');
  expect(bot['pendingAlbums'].size).toBe(0);
  expect(bot['processedAlbumIds'].has('-100:@target:album')).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
  await bot.copyMessage(photo('Hello', 'album'));
  await bot.copyMessage(video('Private caption', 'album'));
  await jest.advanceTimersByTimeAsync(1000);
  expect(rewrite).toHaveBeenCalledTimes(2);
  expect(sendAlbum).not.toHaveBeenCalled();
});

it('ignores duplicate media without delaying the album timer', async () => {
  jest.useFakeTimers();
  const { bot, rewrite, sendAlbum } = await setup();
  await bot.copyMessage(photo('First', 'album'));
  await bot.copyMessage(video('Second', 'album'));
  await jest.advanceTimersByTimeAsync(900);
  await bot.copyMessage(photo('Changed duplicate', 'album'));
  await jest.advanceTimersByTimeAsync(100);
  expect(rewrite.mock.calls).toEqual([['First'], ['Second']]);
  expect(sendAlbum).toHaveBeenCalledTimes(1);
});

it('publishes media in message order even when updates arrive out of order', async () => {
  jest.useFakeTimers();
  const { bot, rewrite, sendAlbum } = await setup();
  await bot.copyMessage(video('Second', 'album'));
  await bot.copyMessage(photo('First', 'album'));
  await jest.advanceTimersByTimeAsync(1000);
  expect(rewrite.mock.calls).toEqual([['First'], ['Second']]);
  expect(sendAlbum).toHaveBeenCalledWith('@target', [
    { type: 'photo', media: 'large', caption: '<b>Привіт</b>', parse_mode: 'HTML' },
    { type: 'video', media: 'video', caption: '<b>Привіт</b>', parse_mode: 'HTML' },
  ]);
});

it.each([1, 11])(
  'skips an album with %i unique media before calling AI or Telegram',
  async (count) => {
    jest.useFakeTimers();
    const { bot, rewrite, sendAlbum } = await setup();
    for (let id = 1; id <= count; id++) {
      await bot.copyMessage({ ...photo('Hello', 'album'), message_id: id });
    }
    await jest.advanceTimersByTimeAsync(1000);
    expect(rewrite).not.toHaveBeenCalled();
    expect(sendAlbum).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'Telegram album skipped' }),
    );
    expect(bot['pendingAlbums'].size).toBe(0);
    expect(bot['processedAlbumIds'].has('-100:@target:album')).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  },
);

it('accepts ten unique media and keeps identical group IDs in different source chats separate', async () => {
  jest.useFakeTimers();
  const { bot, rewrite, sendAlbum } = await setup();
  for (let id = 1; id <= 10; id++) {
    await bot.copyMessage({ ...photo('Hello', 'album'), message_id: id });
  }
  const otherChat = { ...common.chat, id: -200 };
  await bot.copyMessage({ ...photo('Other first', 'album'), chat: otherChat });
  await bot.copyMessage({ ...video('Other second', 'album'), chat: otherChat });
  await jest.advanceTimersByTimeAsync(1000);
  expect(rewrite).toHaveBeenCalledTimes(12);
  expect(sendAlbum).toHaveBeenCalledTimes(2);
  expect(sendAlbum.mock.calls[0][1]).toHaveLength(10);
  expect(sendAlbum.mock.calls[1][1]).toHaveLength(2);
  expect(bot['pendingAlbums'].size).toBe(0);
});

it('releases the album after a Telegram failure and does not retry it on late updates', async () => {
  jest.useFakeTimers();
  const { bot, rewrite, sendAlbum } = await setup();
  sendAlbum.mockRejectedValueOnce(new Error('Private Telegram details'));
  await bot.copyMessage(photo('First', 'album'));
  await bot.copyMessage(video('Second', 'album'));
  await jest.advanceTimersByTimeAsync(1000);
  expect(bot['pendingAlbums'].size).toBe(0);
  expect(bot['processedAlbumIds'].has('-100:@target:album')).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
  expect(JSON.stringify(errors.mock.calls)).not.toContain('Private');
  await bot.copyMessage(photo('First', 'album'));
  await bot.copyMessage(video('Second', 'album'));
  await jest.advanceTimersByTimeAsync(1000);
  expect(rewrite).toHaveBeenCalledTimes(2);
  expect(sendAlbum).toHaveBeenCalledTimes(1);
});

it('evicts the oldest processed ID when a new album exceeds the 10,000-ID cache', async () => {
  jest.useFakeTimers();
  const { bot, sendAlbum } = await setup();
  const cache = bot['processedAlbumIds'];
  for (let id = 0; id < 10_000; id++) cache.add(`-100:@target:album-${id}`);
  await bot.copyMessage(photo('First', 'album-0'));
  await bot.copyMessage(video('Second', 'album-0'));
  expect(bot['pendingAlbums'].size).toBe(0);

  await bot.copyMessage(photo('First', 'new-album'));
  await bot.copyMessage(video('Second', 'new-album'));
  await jest.advanceTimersByTimeAsync(1000);
  expect(cache.size).toBe(10_000);
  expect(cache.has('-100:@target:album-0')).toBe(false);
  expect(cache.has('-100:@target:album-1')).toBe(true);
  expect(cache.has('-100:@target:new-album')).toBe(true);

  await bot.copyMessage(photo('First', 'album-1'));
  await bot.copyMessage(video('Second', 'album-1'));
  await bot.copyMessage(photo('First', 'album-0'));
  await bot.copyMessage(video('Second', 'album-0'));
  await jest.advanceTimersByTimeAsync(1000);
  expect(sendAlbum).toHaveBeenCalledTimes(2);
  expect(cache.size).toBe(10_000);
});

it('does not allocate an album or timer when a photo has no usable file ID', async () => {
  jest.useFakeTimers();
  const { bot } = await setup();
  await expect(bot.copyMessage({ ...photo('First', 'album'), photo: [] })).rejects.toThrow(
    'no photos',
  );
  expect(bot['pendingAlbums'].size).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});

it('an album without captions makes no AI requests', async () => {
  jest.useFakeTimers();
  const { bot, sendAlbum } = await setup('@target', true);
  await bot.copyMessage(photo(undefined, 'album'));
  await bot.copyMessage(video(undefined, 'album'));
  await jest.advanceTimersByTimeAsync(1000);
  expect(globalThis.fetch).not.toHaveBeenCalled();
  expect(sendAlbum).toHaveBeenCalledTimes(1);
});

it('updates arriving during caption generation do not publish the album twice', async () => {
  jest.useFakeTimers();
  const { bot, rewrite, sendAlbum } = await setup();
  let finish!: (html: string) => void;
  const pending = new Promise<string>((resolve) => {
    finish = resolve;
  });
  rewrite.mockReturnValue(pending);
  await bot.copyMessage(photo('Hello', 'album'));
  await bot.copyMessage(video('Hello', 'album'));
  await jest.advanceTimersByTimeAsync(1000);
  await bot.copyMessage(video('Hello', 'album'));
  await jest.advanceTimersByTimeAsync(1000);
  finish('Переклад');
  await jest.advanceTimersByTimeAsync(0);
  expect(sendAlbum).toHaveBeenCalledTimes(1);
});

it.each(['@source', '-100'])('skips the destination channel identified by %s', async (target) => {
  const { bot, rewrite } = await setup(target);
  await bot.instance.handleUpdate({ update_id: 1, channel_post: text() });
  expect(rewrite).not.toHaveBeenCalled();
});

it('catches individual update failures and continues handling later posts', async () => {
  const { bot, rewrite, sendText } = await setup();
  rewrite.mockRejectedValueOnce(new Error('Private failure')).mockResolvedValueOnce('Переклад');
  await bot.instance.handleUpdate({ update_id: 1, channel_post: text() });
  await bot.instance.handleUpdate({ update_id: 2, channel_post: text() });
  expect(sendText).toHaveBeenCalledTimes(1);
  expect(errors).toHaveBeenCalledWith(
    expect.objectContaining({ event: 'Telegram update failed', updateId: 1 }),
  );
  expect(kill).not.toHaveBeenCalled();
  expect(JSON.stringify(errors.mock.calls)).not.toContain('Private');
});

it('replies to /start without looking up an application account', async () => {
  const { bot, rewrite } = await setup();
  const reply = jest.spyOn(Telegram.prototype, 'sendMessage').mockResolvedValue(text());
  await bot.instance.handleUpdate({
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      from: { id: 99, is_bot: false, first_name: 'Visitor' },
      chat: { id: 99, type: 'private', first_name: 'Visitor' },
      text: '/start',
      entities: [{ type: 'bot_command', offset: 0, length: 6 }],
    },
  });
  expect(reply).toHaveBeenCalledWith(99, 'Welcome', expect.any(Object));
  expect(rewrite).not.toHaveBeenCalled();
});

it('starts long-lived polling without blocking startup', async () => {
  const { bot } = await setup();
  const launch = jest.spyOn(bot.instance, 'launch').mockReturnValue(new Promise<void>(() => {}));
  expect(bot.onApplicationBootstrap()).toBeUndefined();
  expect(launch).toHaveBeenCalledTimes(1);
});

it('terminates the shared process after a fatal startup error', async () => {
  const { bot } = await setup();
  jest.spyOn(bot.instance, 'launch').mockRejectedValue(new Error('Private bot details'));
  bot.onApplicationBootstrap();
  await Promise.resolve();
  expect(process.exitCode).toBe(1);
  expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
  expect(JSON.stringify(errors.mock.calls)).not.toContain('Private');
});

it('terminates the process if polling fails after startup', async () => {
  const { bot } = await setup();
  let fail!: (error: Error) => void;
  jest.spyOn(bot.instance, 'launch').mockReturnValue(
    new Promise<void>((_, reject) => {
      fail = reject;
    }),
  );
  bot.onApplicationBootstrap();
  expect(kill).not.toHaveBeenCalled();
  fail(new Error('Private polling failure'));
  await Promise.resolve();
  expect(process.exitCode).toBe(1);
  expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
});

it('does not treat a polling rejection during shutdown as a fatal error', async () => {
  const { bot } = await setup();
  let fail!: (error: Error) => void;
  jest.spyOn(bot.instance, 'launch').mockReturnValue(
    new Promise<void>((_, reject) => {
      fail = reject;
    }),
  );
  jest.spyOn(bot.instance, 'stop').mockImplementation(() => fail(new Error('Stopped')));
  bot.onApplicationBootstrap();
  bot.onApplicationShutdown();
  await Promise.resolve();
  expect(kill).not.toHaveBeenCalled();
});

it('clears processed history and pending albums together on shutdown', async () => {
  jest.useFakeTimers();
  const { bot, rewrite, sendAlbum } = await setup();
  await bot.copyMessage(photo('First', 'completed'));
  await bot.copyMessage(video('Second', 'completed'));
  await jest.advanceTimersByTimeAsync(1000);
  await bot.copyMessage(photo('First', 'pending'));
  await bot.copyMessage(video('Second', 'pending'));
  expect(bot['pendingAlbums'].size).toBe(1);
  expect(bot['processedAlbumIds'].size).toBe(1);
  bot.onApplicationShutdown();
  await jest.advanceTimersByTimeAsync(1000);
  expect(bot['pendingAlbums'].size).toBe(0);
  expect(bot['processedAlbumIds'].size).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
  expect(rewrite).toHaveBeenCalledTimes(2);
  expect(sendAlbum).toHaveBeenCalledTimes(1);
});

it.each([false, true])(
  'does not publish or restore album history when AI settles after shutdown (reject=%s)',
  async (reject) => {
    jest.useFakeTimers();
    const { bot, rewrite, sendAlbum } = await setup();
    let finish!: () => void;
    rewrite.mockReturnValue(
      new Promise<string>((resolve, fail) => {
        finish = () => (reject ? fail(new Error('Stopped')) : resolve('Переклад'));
      }),
    );
    await bot.copyMessage(photo('First', 'album'));
    await bot.copyMessage(video('Second', 'album'));
    await jest.advanceTimersByTimeAsync(1000);
    expect(rewrite).toHaveBeenCalledTimes(2);
    bot.onApplicationShutdown();
    finish();
    await jest.advanceTimersByTimeAsync(0);
    expect(sendAlbum).not.toHaveBeenCalled();
    expect(bot['pendingAlbums'].size).toBe(0);
    expect(bot['processedAlbumIds'].size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
    expect(kill).not.toHaveBeenCalled();
  },
);

it('stops polling and cancels pending albums on shutdown', async () => {
  jest.useFakeTimers();
  const { bot, rewrite, sendAlbum } = await setup();
  const stop = jest.spyOn(bot.instance, 'stop').mockImplementation(() => {});
  await bot.copyMessage(photo('First', 'album'));
  await bot.copyMessage(video('Second', 'album'));
  bot.onApplicationShutdown();
  await jest.advanceTimersByTimeAsync(1000);
  expect(stop).toHaveBeenCalledWith('Application shutdown');
  expect(rewrite).not.toHaveBeenCalled();
  expect(sendAlbum).not.toHaveBeenCalled();
  expect(kill).not.toHaveBeenCalled();
});

it('does not publish results that complete after shutdown', async () => {
  const { bot, rewrite, sendText } = await setup();
  let finish!: (html: string) => void;
  rewrite.mockReturnValue(
    new Promise<string>((resolve) => {
      finish = resolve;
    }),
  );
  const publication = bot.copyMessage(text());
  bot.onApplicationShutdown();
  finish('Переклад');
  await publication;
  expect(sendText).not.toHaveBeenCalled();
});
