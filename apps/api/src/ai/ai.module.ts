import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_MODEL, createLanguageModel } from './model';
import { TextRewriterService } from './text-rewriter.service';

@Module({
  providers: [
    { provide: AI_MODEL, useFactory: createLanguageModel, inject: [ConfigService] },
    TextRewriterService,
  ],
  exports: [TextRewriterService],
})
export class AiModule {}
