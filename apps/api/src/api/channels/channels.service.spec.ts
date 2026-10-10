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
});
