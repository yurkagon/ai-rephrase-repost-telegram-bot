import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TelegramError } from 'telegraf';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { TelegramService } from '@/telegram/telegram.service';
import { RedisService } from '@/infra/redis/redis.service';

import { assertAcyclic, ChannelsService } from './channels.service';

it('rejects self loops and transitive cycles', () => {
  expect(() => assertAcyclic([], 'a', 'a')).toThrow('cycle');
  expect(() =>
    assertAcyclic(
      [
        { sourceId: 'b', targetId: 'c' },
        { sourceId: 'c', targetId: 'a' },
      ],
      'a',
      'b',
    ),
  ).toThrow('cycle');
  expect(() => assertAcyclic([{ sourceId: 'a', targetId: 'b' }], 'b', 'c')).not.toThrow();
});

it('checks user and bot rights instead of trusting usernames', async () => {
  const db = { user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ telegramId: '22' }) } };
  const member = jest
    .fn()
    .mockResolvedValueOnce({ status: 'member' })
    .mockResolvedValueOnce({ status: 'administrator', can_post_messages: true });
  const bot = {
    telegram: {
      getMe: jest.fn().mockResolvedValue({ id: 1 }),
      getChat: jest.fn().mockResolvedValue({ type: 'channel', id: -100123, title: 'test' }),
      getChatMember: member,
    },
  };
  const service = new ChannelsService(
    db as unknown as PrismaService,
    bot as unknown as TelegramService,
    {} as RedisService,
  );

  await expect(service.checkRights('u', '@channel')).rejects.toThrow('administrator rights');
});

describe('channel identifier input', () => {
  const findUser = jest.fn();
  const findChannel = jest.fn();
  const upsert = jest.fn();
  const getChat = jest.fn();
  const getMe = jest.fn();
  const getChatMember = jest.fn();
  const canonicalId = '-1002145747740';
  const service = new ChannelsService(
    {
      user: { findUniqueOrThrow: findUser },
      channel: { findUnique: findChannel, upsert },
    } as unknown as PrismaService,
    { telegram: { getChat, getMe, getChatMember } } as unknown as TelegramService,
    {} as RedisService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    findUser.mockResolvedValue({ telegramId: '22' });
    findChannel.mockResolvedValue(null);
    getChat.mockResolvedValue({ type: 'channel', id: Number(canonicalId), title: 'Channel' });
    getMe.mockResolvedValue({ id: 1 });
    getChatMember.mockImplementation((_chat: number, id: number) =>
      Promise.resolve(
        id === 1 ? { status: 'administrator', can_post_messages: true } : { status: 'creator' },
      ),
    );
    upsert.mockResolvedValue({ chatId: canonicalId });
  });

  it.each([
    ['1002145747740', canonicalId],
    [canonicalId, canonicalId],
    [' 1002145747740 ', canonicalId],
    ['@channel_name', '@channel_name'],
    [' @channel_name ', '@channel_name'],
  ])('accepts %s and uses the canonical Telegram ID', async (input, expected) => {
    await expect(service.add('owner', input)).resolves.toEqual({ chatId: canonicalId });

    expect(getChat).toHaveBeenCalledWith(expected);
    expect(getChatMember).toHaveBeenCalledWith(Number(canonicalId), 22);
    expect(getChatMember).toHaveBeenCalledWith(Number(canonicalId), 1);
    expect(findChannel).toHaveBeenCalledWith({ where: { chatId: canonicalId } });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { chatId: canonicalId },
        create: expect.objectContaining({ ownerId: 'owner', chatId: canonicalId }) as unknown,
      }),
    );
  });

  it.each([
    '',
    ' ',
    '@abcd',
    '2145747740',
    '1002145747740.1',
    '--1002145747740',
    'https://t.me/+invite',
  ])('rejects invalid input %s before contacting Telegram', async (input) => {
    await expect(service.add('owner', input)).rejects.toThrow(
      'Enter a channel username or numeric ID',
    );
    expect(getChat).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('still rejects an unsigned ID when the user is not a channel administrator', async () => {
    getChatMember.mockResolvedValueOnce({ status: 'member' });

    await expect(service.add('owner', '1002145747740')).rejects.toThrow('administrator rights');
    expect(upsert).not.toHaveBeenCalled();
  });

  it.each([
    ['getChat', 400, 'Bad Request: chat not found', BadRequestException],
    ['getChat', 403, 'Forbidden: bot was kicked from the channel chat', ForbiddenException],
    ['getChatMember', 400, 'Bad Request: member list is inaccessible', BadRequestException],
    [
      'getChatMember',
      403,
      'Forbidden: bot is not a member of the channel chat',
      ForbiddenException,
    ],
  ])(
    'explains inaccessible channels from %s (%s)',
    async (method, code, description, exception) => {
      const mock = method === 'getChat' ? getChat : getChatMember;

      mock.mockRejectedValue(new TelegramError({ error_code: code, description }));

      const result = service.add('owner', '@channel_name');

      await expect(result).rejects.toBeInstanceOf(exception);
      await expect(result).rejects.toThrow('Check the username or ID and add the bot');
      expect(upsert).not.toHaveBeenCalled();
    },
  );

  it('explains missing bot administrator rights reported by Telegram', async () => {
    getChatMember.mockRejectedValue(
      new TelegramError({ error_code: 400, description: 'Bad Request: not enough rights' }),
    );

    await expect(service.add('owner', '@channel_name')).rejects.toThrow(
      new ForbiddenException('Add the bot as channel administrator'),
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it.each(['member', 'left', 'kicked'])(
    'requires administrator status for a %s bot',
    async (status) => {
      getChatMember.mockImplementation((_chat: number, id: number) =>
        Promise.resolve({ status: id === 1 ? status : 'creator' }),
      );

      await expect(service.add('owner', '@channel_name')).rejects.toThrow(
        'Add the bot as channel administrator',
      );
      expect(upsert).not.toHaveBeenCalled();
    },
  );

  it.each([
    new TelegramError({ error_code: 401, description: 'Unauthorized' }),
    new TelegramError({ error_code: 429, description: 'Too Many Requests' }),
    new TelegramError({ error_code: 500, description: 'Internal Server Error' }),
    new Error('Connection failed'),
  ])('does not misreport unrelated Telegram failures as missing permissions', async (error) => {
    getChat.mockRejectedValue(error);

    await expect(service.add('owner', '@channel_name')).rejects.toBe(error);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('channel avatars', () => {
  const findFirst = jest.fn();
  const getChat = jest.fn();
  const getFileLink = jest.fn();
  const service = new ChannelsService(
    { channel: { findFirst } } as unknown as PrismaService,
    { telegram: { getChat, getFileLink } } as unknown as TelegramService,
    {} as RedisService,
  );
  const privateUrl = new URL('https://api.telegram.org/file/botprivate-token/photo.jpg');
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    jest.resetAllMocks();
    findFirst.mockResolvedValue({ chatId: '-100123' });
    getChat.mockResolvedValue({ type: 'channel', photo: { small_file_id: 'small-photo' } });
    getFileLink.mockResolvedValue(privateUrl);
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns the current small photo only after verifying ownership', async () => {
    fetchMock.mockResolvedValue(new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg' } }));

    const result = await service.avatar('owner', 'channel');

    expect(findFirst).toHaveBeenCalledWith({ where: { id: 'channel', ownerId: 'owner' } });
    expect(getChat).toHaveBeenCalledWith('-100123');
    expect(getFileLink).toHaveBeenCalledWith('small-photo');
    expect(result).toEqual({ buffer: jpeg, contentType: 'image/jpeg' });
    expect(fetchMock).toHaveBeenCalledWith(privateUrl, {
      signal: expect.any(AbortSignal) as unknown,
      redirect: 'error',
    });
  });

  it('does not contact Telegram for another account’s channel', async () => {
    findFirst.mockResolvedValue(null);

    await expect(service.avatar('other-owner', 'channel')).rejects.toThrow('Channel not found');
    expect(getChat).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [jpeg, 'image/jpeg'],
    [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'],
    [Buffer.from('RIFF0000WEBP'), 'image/webp'],
  ])('recognizes a Telegram binary download as %s', async (image, contentType) => {
    fetchMock.mockResolvedValue(
      new Response(image, { headers: { 'Content-Type': 'application/octet-stream' } }),
    );

    await expect(service.avatar('owner', 'channel')).resolves.toEqual({
      buffer: image,
      contentType,
    });
  });

  it.each(['application/octet-stream', 'image/jpeg'])(
    'rejects non-image bytes even when declared as %s',
    async (contentType) => {
      fetchMock.mockResolvedValue(
        new Response('<svg/>', { headers: { 'Content-Type': contentType } }),
      );

      await expect(service.avatar('owner', 'channel')).rejects.toThrow(
        'Channel photo is unavailable',
      );
    },
  );

  it('reports a missing photo without downloading', async () => {
    getChat.mockResolvedValue({ type: 'channel' });

    await expect(service.avatar('owner', 'channel')).rejects.toThrow('Channel has no photo');
    expect(getFileLink).not.toHaveBeenCalled();
  });

  it.each([
    new Response('missing', { status: 404 }),
    new Response(null),
    new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } }),
  ])('rejects failed downloads and unsupported images', async (response) => {
    fetchMock.mockResolvedValue(response);

    await expect(service.avatar('owner', 'channel')).rejects.toThrow(
      'Channel photo is unavailable',
    );
  });

  it('does not expose the private Telegram download URL on failure', async () => {
    fetchMock.mockRejectedValue(new Error(String(privateUrl)));

    await expect(service.avatar('owner', 'channel')).rejects.toThrow(
      'Channel photo is unavailable',
    );
  });

  it('enforces the byte limit even without a content-length header', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(2 * 1024 * 1024));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });
    fetchMock.mockResolvedValue(new Response(body, { headers: { 'Content-Type': 'image/jpeg' } }));

    await expect(service.avatar('owner', 'channel')).rejects.toThrow(
      'Channel photo is unavailable',
    );
  });
});
