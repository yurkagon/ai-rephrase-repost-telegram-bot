import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module';
import { ChannelsModule } from './channels/channels.module';
import { HealthController } from './health.controller';
import { PostsModule } from './posts/posts.module';
import { UserModule } from './user/user.module';

@Module({
  controllers: [HealthController],
  imports: [AuthModule, UserModule, ChannelsModule, PostsModule],
})
export class ApiModule {}
