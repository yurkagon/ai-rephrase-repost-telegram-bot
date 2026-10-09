import { Module } from '@nestjs/common';
import { ConfigModule } from '@/config/config.module';

import { InfraModule } from '@/infra/infra.module';

import { ApiModule } from './api/api.module';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [ConfigModule, InfraModule, ApiModule, TelegramModule],
})
export class AppModule {}
