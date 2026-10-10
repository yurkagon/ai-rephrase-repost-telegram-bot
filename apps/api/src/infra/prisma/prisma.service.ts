import { Injectable, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '@/config/env.schema';
import { Pool } from 'pg';

import { PrismaClient } from '@generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  private readonly pool: Pool;
  public constructor(private readonly configService: ConfigService<Environment>) {
    const pool = new Pool({
      connectionString: configService.getOrThrow('DATABASE_URL', { infer: true }),
    });
    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.pool = pool;
  }

  public async onModuleInit() {
    await this.$connect();
  }

  public async onApplicationShutdown() {
    await this.$disconnect();
    await this.pool.end();
  }
}

export type * from '@generated/prisma/models';
export * from '@generated/prisma/enums';
