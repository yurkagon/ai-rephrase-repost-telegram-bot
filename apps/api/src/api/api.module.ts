import { HealthController } from './health.controller';
import { Module } from '@nestjs/common';

import { AuthModule } from '@/api/auth/auth.module';
import { UserModule } from '@/api/user/user.module';

@Module({
  controllers: [HealthController],
  imports: [AuthModule, UserModule],
})
export class ApiModule {}
