import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ConfigModule } from '@/config/config.module';
import type { Environment } from '@/config/env.schema';
import { InfraModule } from '@/infra/infra.module';

import { ApiModule } from './api/api.module';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [
    ConfigModule,
    InfraModule,
    ApiModule,
    TelegramModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment>) => ({
        token: config.getOrThrow('TELEGRAM_BOT_API_TOKEN', { infer: true }),
      }),
    }),
  ],
})
export class AppModule {}
