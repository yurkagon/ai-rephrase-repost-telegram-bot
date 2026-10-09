import { Module } from '@nestjs/common';
import { AiModule } from '@/ai/ai.module';
import { TelegramService } from './telegram.service';

@Module({
  imports: [AiModule],
  providers: [TelegramService],
})
export class TelegramModule {}
