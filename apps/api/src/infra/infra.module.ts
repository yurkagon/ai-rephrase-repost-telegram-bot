import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infra/prisma/prisma.module';
import { RedisModule } from '@/infra/redis/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
})
export class InfraModule {}
