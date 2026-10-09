import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '@/config/env.schema';
import { createLanguageModel } from './model';
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import {
  AIMessage,
  BaseMessage,
  ChatMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import type { Runnable } from '@langchain/core/runnables';
import { z } from 'zod';
import { systemPrompt, developerPrompt } from './prompt';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly modelName: string;
  private readonly model: Runnable<
    BaseLanguageModelInput,
    {
      raw: BaseMessage;
      parsed: RewriteOutput | null;
    }
  >;

  constructor(config: ConfigService<Environment>) {
    const model = createLanguageModel(config);
    const params: unknown = model.invocationParams();
    this.modelName =
      params && typeof params === 'object' && 'model' in params && typeof params.model === 'string'
        ? params.model
        : model.getName();
    this.model = model.withStructuredOutput<RewriteOutput>(rewriteSchema, {
      name: 'telegram_rewrite',
      method: 'jsonSchema',
      strict: true,
      includeRaw: true,
    });
  }

  public async rewrite(text: string): Promise<string> {
    if (text.trim().length < 2) return '';

    const startedAt = Date.now();
    let raw: BaseMessage | undefined;
    let outcome = 'provider_error';
    try {
      const response = await this.model.invoke([
        new SystemMessage(systemPrompt),
        new ChatMessage({ role: 'developer', content: developerPrompt }),
        new HumanMessage(text),
      ]);
      raw = response.raw;
      if (
        raw.additional_kwargs.refusal ||
        (Array.isArray(raw.content) &&
          raw.content.some((block) => typeof block === 'object' && block.type === 'refusal'))
      ) {
        outcome = 'refused';
        throw new Error('AI refused to rewrite the post.');
      }

      const metadata: Record<string, unknown> = raw.response_metadata;
      if (
        (metadata.status && metadata.status !== 'completed') ||
        metadata.incomplete_details ||
        metadata.finish_reason === 'length' ||
        metadata.finish_reason === 'content_filter'
      ) {
        outcome = 'incomplete';
        throw new Error('AI returned an incomplete response.');
      }

      const result = rewriteSchema.safeParse(response.parsed);
      if (!result.success) {
        outcome = 'invalid_output';
        throw new Error('AI returned invalid structured output.');
      }
      if (!result.data.html.trim()) {
        outcome = 'empty_output';
        throw new Error('AI returned an empty post.');
      }

      outcome = 'success';
      return result.data.html;
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof z.ZodError) outcome = 'invalid_output';
      throw error;
    } finally {
      this.logger.log({
        event: 'AI rewrite',
        model: this.modelName,
        durationMs: Date.now() - startedAt,
        tokens: AIMessage.isInstance(raw) ? raw.usage_metadata : undefined,
        outcome,
      });
    }
  }
}

const rewriteSchema = z.strictObject({
  html: z.string().describe('The final Ukrainian Telegram post with its original HTML formatting.'),
});
type RewriteOutput = z.infer<typeof rewriteSchema>;
