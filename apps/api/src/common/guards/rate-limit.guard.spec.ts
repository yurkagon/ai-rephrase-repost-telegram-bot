import { ExecutionContext, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '@/config/env.schema';
import { RedisService } from '@/infra/redis/redis.service';

import { RateLimitGuard } from './rate-limit.guard';

describe('RateLimitGuard', () => {
  const exec = jest.fn();
  const transaction = {
    incr: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec,
  };
  const multi = jest.fn(() => transaction);
  const redis = { client: { multi } } as unknown as RedisService;
  const config = new ConfigService<Environment>({
    APP_URL: 'https://app.example.com',
    CORS_ORIGIN: ['https://other.example.com'],
  });
  const guard = new RateLimitGuard(redis, config);
  const contextFor = (action = 'login', origin?: string, ip = '127.0.0.1') =>
    ({
      getHandler: () => ({ name: action }),
      switchToHttp: () => ({ getRequest: () => ({ ip, headers: { origin } }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    exec.mockResolvedValue([
      [null, 1],
      [null, 1],
    ]);
  });

  it.each([
    ['login', 20, true],
    ['login', 21, false],
    ['register', 21, false],
    ['refresh', 120, true],
    ['refresh', 121, false],
  ])('enforces the %s limit at %i requests', async (action, count, allowed) => {
    exec.mockResolvedValue([
      [null, count],
      [null, 0],
    ]);

    const result = guard.canActivate(contextFor(action));

    if (allowed) {
      await expect(result).resolves.toBe(true);
    } else {
      await expect(result).rejects.toEqual(new HttpException('Try again later', 429));
    }
  });

  it('keeps separate counters for each IP and action without exposing the IP', async () => {
    await guard.canActivate(contextFor('login'));
    await guard.canActivate(contextFor('register'));
    await guard.canActivate(contextFor('login', undefined, '127.0.0.2'));

    const keys = transaction.incr.mock.calls.map(([key]: [string]) => key);

    expect(new Set(keys).size).toBe(3);
    expect(keys.every((key) => !key.includes('127.0.0.'))).toBe(true);
  });

  it.each([undefined, 'https://app.example.com', 'https://other.example.com'])(
    'allows the configured origin %s',
    async (origin) => {
      await expect(guard.canActivate(contextFor('login', origin))).resolves.toBe(true);
    },
  );

  it('rejects a foreign origin before incrementing the counter', async () => {
    await expect(
      guard.canActivate(contextFor('login', 'https://untrusted.example.com')),
    ).rejects.toEqual(new HttpException('Origin is not allowed', 403));
    expect(multi).not.toHaveBeenCalled();
  });

  it.each([0, 1])('propagates an error from Redis command %i', async (index) => {
    const error = new Error('Redis command failed');
    const results: [Error | null, number | null][] = [
      [null, 1],
      [null, 1],
    ];

    results[index] = [error, null];
    exec.mockResolvedValue(results);

    await expect(guard.canActivate(contextFor())).rejects.toBe(error);
  });

  it('propagates a Redis connection failure', async () => {
    const error = new Error('Redis connection failed');

    exec.mockRejectedValueOnce(error);

    await expect(guard.canActivate(contextFor())).rejects.toBe(error);
  });

  it.each([
    null,
    [],
    [
      [null, 'invalid'],
      [null, 1],
    ],
  ])('rejects an unusable Redis transaction result %j', async (result) => {
    exec.mockResolvedValue(result);

    await expect(guard.canActivate(contextFor())).rejects.toThrow(/Redis rate limit/);
  });
});
