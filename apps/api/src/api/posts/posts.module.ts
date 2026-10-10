import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '@/config/env.schema';
import { AiModule } from '@/ai/ai.module';
import { ChannelsModule } from '@/api/channels/channels.module';

import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { PostsProcessor } from './posts.processor';

@Module({
  imports: [
    AiModule,
    ChannelsModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment>) => {
        const url = new URL(config.getOrThrow('REDIS_URL', { infer: true }));

        return {
          extraOptions: { manualRegistration: true },
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            username: decodeURIComponent(url.username) || undefined,
            password: decodeURIComponent(url.password) || undefined,
            db: Number(url.pathname.slice(1) || 0),
            ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
          },
        };
      },
    }),
    BullModule.registerQueue({ name: 'posts' }),
  ],
  controllers: [PostsController],
  providers: [PostsService, PostsProcessor],
})
export class PostsModule {}
