import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { InfraModule } from '@/infra/infra.module';

import { ApiModule } from './api/api.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
    }),
    InfraModule,
    ApiModule,
  ],
})
export class AppModule {}
