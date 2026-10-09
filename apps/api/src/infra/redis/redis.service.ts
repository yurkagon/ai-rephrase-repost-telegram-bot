import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly redisClient: Redis;

  constructor(private readonly configService: ConfigService) {
    // A single URL keeps TLS in one place: `rediss://` turns it on, `redis://` does not.
    this.redisClient = new Redis(this.configService.getOrThrow<string>('REDIS_URL'));

    this.redisClient.on('error', (error: unknown) => {
      this.logger.error('Redis connection error', error);
    });
  }

  public async get(key: string) {
    return this.redisClient.get(key);
  }

  public async save(key: string, value: string, ttl?: number) {
    if (ttl) {
      return this.redisClient.set(key, value, 'EX', ttl);
    }

    return this.redisClient.set(key, value);
  }

  public async retrieve<T>({
    strategy,
    key,
    isDisabled,
    ttl,
  }: {
    key: string;
    strategy: () => Promise<T> | T;
    isDisabled?: boolean;
    ttl?: number;
  }): Promise<T> {
    if (isDisabled) {
      return strategy();
    }

    const redisData = await this.get(key);

    if (redisData) {
      return JSON.parse(redisData) as T;
    }

    const data = await strategy();

    if (data !== null && data !== undefined) {
      await this.save(key, JSON.stringify(data), ttl);
    }

    return data;
  }

  public async del(key: string) {
    return this.redisClient.del(key);
  }

  public get client() {
    return this.redisClient;
  }

  public onModuleDestroy() {
    return this.redisClient.quit();
  }
}
