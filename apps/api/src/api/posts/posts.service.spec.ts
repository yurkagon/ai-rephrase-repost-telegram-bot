import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { BullRegistrar } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { buffer } from 'node:stream/consumers';

import type { ChannelsService } from '@/api/channels/channels.service';
import type { PrismaService } from '@/infra/prisma/prisma.service';
import type { TelegramService } from '@/telegram/telegram.service';

import { postInclude, PostsService } from './posts.service';

const previewLimit = 20 * 1024 * 1024;
const jpeg = Buffer.from('ffd8ffe000104a464946000101010060', 'hex');
const mp4 = Buffer.from('000000206674797069736f6d00000200', 'hex');

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
    findFirst.mockResolvedValue({
      media: [{ id: 'media-id', fileId: file.file_id, type: 'photo' }],
    });
    getFile.mockResolvedValue(file);
    getFileLink.mockResolvedValue(url);
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => jest.restoreAllMocks());

  it('streams the owned Telegram file without returning its private URL', async () => {
    fetchMock.mockResolvedValue(new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg' } }));

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
    expect(await buffer(result.stream)).toEqual(jpeg);
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
    [jpeg, 'photo', 'image/jpeg'],
    [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'photo', 'image/png'],
    [Buffer.from('RIFF0000WEBP'), 'photo', 'image/webp'],
    [mp4, 'video', 'video/mp4'],
  ])('streams a Telegram binary download with the correct MIME (%s)', async (image, type, mime) => {
    findFirst.mockResolvedValue({ media: [{ id: 'media-id', fileId: file.file_id, type }] });
    fetchMock.mockResolvedValue(
      new Response(image, { headers: { 'Content-Type': 'application/octet-stream' } }),
    );

    const result = await service.media('owner-id', 'post-id', 'media-id');

    expect(result.contentType).toBe(mime);
    expect(await buffer(result.stream)).toEqual(image);
  });

  it('detects a signature split across chunks without dropping any bytes', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of jpeg) controller.enqueue(Uint8Array.of(byte));
        controller.close();
      },
    });
    fetchMock.mockResolvedValue(
      new Response(body, { headers: { 'Content-Type': 'application/octet-stream' } }),
    );

    const result = await service.media('owner-id', 'post-id', 'media-id');

    expect(result.contentType).toBe('image/jpeg');
    expect(await buffer(result.stream)).toEqual(jpeg);
  });

  it.each([Buffer.from('<svg/>'), Buffer.from('00000020667479707174202000000200', 'hex'), mp4])(
    'rejects unsupported or mismatched file bytes',
    async (bytes) => {
      fetchMock.mockResolvedValue(
        new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } }),
      );

      await expect(service.media('owner-id', 'post-id', 'media-id')).rejects.toThrow(
        ServiceUnavailableException,
      );
    },
  );

  it('cancels the upstream download when the consumer stops reading', async () => {
    const cancel = jest.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(jpeg);
      },
      cancel,
    });
    fetchMock.mockResolvedValue(
      new Response(body, { headers: { 'Content-Type': 'application/octet-stream' } }),
    );
    const result = await service.media('owner-id', 'post-id', 'media-id');

    for await (const chunk of result.stream) {
      expect(chunk).toEqual(jpeg);
      break;
    }

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(cancel).toHaveBeenCalled();
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
        controller.enqueue(jpeg);
        controller.enqueue(new Uint8Array(previewLimit));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });

    fetchMock.mockResolvedValue(new Response(body, { headers: { 'Content-Type': 'image/jpeg' } }));
    const result = await service.media('owner-id', 'post-id', 'media-id');

    await expect(buffer(result.stream)).rejects.toThrow('Preview limit exceeded');
  });
});
