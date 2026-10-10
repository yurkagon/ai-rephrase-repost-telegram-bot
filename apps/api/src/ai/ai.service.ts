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
import { systemPrompt, buildDeveloperPrompt, promptVersion } from './prompt';
import {
  defaultRewriteOptions,
  rewriteOptionsSchema,
  RewriteError,
  type RewriteOptions,
  type RewriteResult,
} from './rewrite-options';

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

  public async rewrite(
    text: string,
    settings: RewriteOptions = defaultRewriteOptions,
  ): Promise<RewriteResult> {
    const options = rewriteOptionsSchema.parse(settings);
    if (text.trim().length < 2)
      return { html: '', model: this.modelName, promptVersion, durationMs: 0, outcome: 'skipped' };
    if (text.length > 16_000) throw new Error('Post exceeds AI input limit.');

    const startedAt = Date.now();
    let raw: BaseMessage | undefined;
    let outcome = 'provider_error';
    try {
      const response = await this.model.invoke([
        new SystemMessage(systemPrompt),
        new ChatMessage({ role: 'developer', content: buildDeveloperPrompt(options) }),
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
      const usage = AIMessage.isInstance(raw) ? raw.usage_metadata : undefined;
      return {
        html: result.data.html,
        model: this.modelName,
        promptVersion,
        durationMs: Date.now() - startedAt,
        inputTokens: usage?.input_tokens,
        outputTokens: usage?.output_tokens,
        outcome,
      };
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof z.ZodError) outcome = 'invalid_output';
      const usage = AIMessage.isInstance(raw) ? raw.usage_metadata : undefined;
      throw new RewriteError({
        model: this.modelName,
        promptVersion,
        outcome,
        durationMs: Date.now() - startedAt,
        inputTokens: usage?.input_tokens,
        outputTokens: usage?.output_tokens,
      });
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
  html: z
    .string()
    .describe(
      'The final Telegram post in the requested target language, with Telegram-compatible HTML formatting.',
    ),
});
type RewriteOutput = z.infer<typeof rewriteSchema>;
