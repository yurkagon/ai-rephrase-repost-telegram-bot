import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { environmentSchema } from './env.schema';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
      expandVariables: true,
      skipProcessEnv: true,
      validate: (values) => environmentSchema.parse(values),
    }),
  ],
  exports: [NestConfigModule],
})
export class ConfigModule {}
