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
