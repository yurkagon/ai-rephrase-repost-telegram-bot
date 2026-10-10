import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { createHash } from 'node:crypto';

import { RedisService } from '@/infra/redis/redis.service';
import type { Environment } from '@/config/env.schema';

@Injectable()
export class PublicAuthGuard implements CanActivate {
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
    const count = Number(
      await this.redis.client.eval(
        "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 600) end; return n",
        1,
        key,
      ),
    );

    if (count > (action === 'refresh' ? 120 : 20)) throw new HttpException('Try again later', 429);

    return true;
  }
}
