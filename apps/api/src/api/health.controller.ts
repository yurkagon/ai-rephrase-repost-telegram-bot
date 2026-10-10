import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { RedisService } from '@/infra/redis/redis.service';
@Controller('health')
export class HealthController {
  constructor(
    private readonly db: PrismaService,
    private readonly redis: RedisService,
  ) {}
  @Get() async health() {
    try {
      await Promise.all([this.db.$queryRaw`SELECT 1`, this.redis.client.ping()]);
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Dependencies unavailable');
    }
  }
}
