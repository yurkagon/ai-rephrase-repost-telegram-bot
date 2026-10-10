import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { BullRegistrar } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { buffer } from 'node:stream/consumers';

import type { ChannelsService } from '@/api/channels/channels.service';
import type { PrismaService } from '@/infra/prisma/prisma.service';
import type { TelegramService } from '@/telegram/telegram.service';

import { postInclude, PostsService } from './posts.service';

const previewLimit = 20 * 1024 * 1024;

const file = { file_id: 'telegram-file', file_path: 'photos/file.jpg', file_size: 3 };

const url = new URL('https://api.telegram.org/file/botprivate-test-token/photos/file.jpg');

describe('PostsService media preview', () => {
  const findFirst = jest.fn();
  const getFile = jest.fn();
  const getFileLink = jest.fn();
  const service = new PostsService(
    { post: { findFirst } } as unknown as PrismaService,
    { telegram: { getFile, getFileLink } } as unknown as TelegramService,
    {} as Queue,
    {} as BullRegistrar,
    {} as ChannelsService,
  );
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    jest.resetAllMocks();
    findFirst.mockResolvedValue({ media: [{ id: 'media-id', fileId: file.file_id }] });
    getFile.mockResolvedValue(file);
    getFileLink.mockResolvedValue(url);
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => jest.restoreAllMocks());

  it('streams the owned Telegram file without returning its private URL', async () => {
    fetchMock.mockResolvedValue(new Response('abc', { headers: { 'Content-Type': 'image/jpeg' } }));

    const result = await service.media('owner-id', 'post-id', 'media-id');

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'post-id', route: { ownerId: 'owner-id' } },
      include: postInclude,
    });
    expect(getFile).toHaveBeenCalledWith(file.file_id);
    expect(getFileLink).toHaveBeenCalledWith(file);
    expect(fetchMock).toHaveBeenCalledWith(url, {
      signal: expect.any(AbortSignal) as unknown,
      redirect: 'error',
    });
    expect(result.contentType).toBe('image/jpeg');
    expect((await buffer(result.stream)).toString()).toBe('abc');
    expect(Object.keys(result).sort()).toEqual(['contentType', 'stream']);
  });

  it('checks ownership and media membership before contacting Telegram', async () => {
    findFirst.mockResolvedValueOnce(null);
    await expect(service.media('other-owner', 'post-id', 'media-id')).rejects.toThrow(
      NotFoundException,
    );

    await expect(service.media('owner-id', 'post-id', 'unrelated-media')).rejects.toThrow(
      'Media not found',
    );
    expect(getFile).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { ...file, file_path: undefined },
    { ...file, file_size: previewLimit + 1 },
  ])('rejects unavailable or oversized Telegram files before downloading', async (file) => {
    getFile.mockResolvedValue(file);

    await expect(service.media('owner-id', 'post-id', 'media-id')).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(getFileLink).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    new Response('Not found', { status: 404 }),
    new Response(null),
    new Response('<svg></svg>', { headers: { 'Content-Type': 'image/svg+xml' } }),
  ])('rejects failed downloads, missing bodies and unsupported preview types', async (response) => {
    fetchMock.mockResolvedValue(response);

    await expect(service.media('owner-id', 'post-id', 'media-id')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('does not expose upstream errors containing the bot token', async () => {
    fetchMock.mockRejectedValue(new Error(`Download failed: ${url}`));

    await expect(service.media('owner-id', 'post-id', 'media-id')).rejects.toThrow(
      'Media preview is unavailable; the saved Telegram file can still be published',
    );
  });

  it('enforces the streamed byte limit even when Telegram omits the file size', async () => {
    getFile.mockResolvedValue({ ...file, file_size: undefined });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(previewLimit));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });

    fetchMock.mockResolvedValue(new Response(body, { headers: { 'Content-Type': 'video/mp4' } }));
    const result = await service.media('owner-id', 'post-id', 'media-id');

    await expect(buffer(result.stream)).rejects.toThrow('Preview limit exceeded');
  });
});
