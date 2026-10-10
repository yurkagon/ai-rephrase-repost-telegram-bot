import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { createHash } from 'node:crypto';

import type { Environment } from '@/config/env.schema';
import { RedisService } from '@/infra/redis/redis.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService<Environment>,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.headers.origin;
    const allowed = [
      new URL(this.config.getOrThrow('APP_URL', { infer: true })).origin,
      ...(this.config.get('CORS_ORIGIN', { infer: true }) ?? []),
    ];

    if (origin && !allowed.includes(origin)) throw new HttpException('Origin is not allowed', 403);

    const ip = createHash('sha256')
      .update(request.ip ?? 'unknown')
      .digest('hex');
    const action = context.getHandler().name;
    const key = `auth:limit:${ip}:${action}`;

    // NX preserves the expiry set by the first request in this window.
    const results = await this.redis.client.multi().incr(key).expire(key, 600, 'NX').exec();

    if (!results) throw new Error('Redis rate limit transaction aborted');

    for (const [error] of results) {
      if (error) throw error;
    }

    const count = results[0]?.[1];

    if (typeof count !== 'number') throw new Error('Invalid Redis rate limit response');

    if (count > (action === 'refresh' ? 120 : 20)) throw new HttpException('Try again later', 429);

    return true;
  }
}
