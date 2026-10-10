import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRetryable } from '@langchain/core/errors';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import {
  AIMessage,
  BaseMessage,
  ChatMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import type { Runnable } from '@langchain/core/runnables';
import { ChatOpenAI, OpenAIClient } from '@langchain/openai';
import { z } from 'zod';

import type { Environment } from '@/config/env.schema';

import { systemPrompt, buildDeveloperPrompt, promptVersion } from './prompts/rewrite';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly modelName: string;
  private readonly model: Runnable<BaseLanguageModelInput, { raw: BaseMessage; parsed: unknown }>;

  constructor(config: ConfigService<Environment>) {
    const model = AiService.createLanguageModel(config);
    this.modelName = model.getName();
    this.model = model.withStructuredOutput(outputSchema, {
      name: 'telegram_rewrite',
      method: 'jsonSchema',
      strict: true,
      includeRaw: true,
    });
  }

  public static createLanguageModel(config: ConfigService<Environment>): BaseChatModel {
    const apiKey = config.getOrThrow('OPENAI_API_KEY', { infer: true });
    const model = config.getOrThrow('LLM_MODEL', { infer: true });

    return new ChatOpenAI({
      apiKey,
      model,
      useResponsesApi: true,
      reasoning: { effort: 'low' },
      timeout: 30_000,
      maxRetries: 2,
      // SDK parsing happens inside the retry loop, so only retry transport failures.
      onFailedAttempt(error: unknown) {
        const status =
          error && typeof error === 'object' && 'status' in error ? error.status : undefined;
        const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
        const connectionError =
          error instanceof OpenAIClient.APIConnectionError ||
          (error instanceof Error && error.name === 'TimeoutError');

        if (
          getRetryable(error) === false ||
          !(
            connectionError ||
            status === 408 ||
            (status === 429 && code !== 'insufficient_quota') ||
            (typeof status === 'number' && status >= 500)
          )
        ) {
          throw error;
        }
      },
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
      const response = await this.model.invoke(this.buildMessages(text, options));
      raw = response.raw;

      const html = this.validateResponse(raw, response.parsed, startedAt);
      outcome = 'success';

      return { html, ...this.buildMetadata(startedAt, outcome, raw) };
    } catch (error) {
      if (error instanceof RewriteError) {
        outcome = error.metadata.outcome;

        throw error;
      }

      outcome =
        error instanceof SyntaxError || error instanceof z.ZodError
          ? 'invalid_output'
          : 'provider_error';

      throw new RewriteError(this.buildMetadata(startedAt, outcome, raw));
    } finally {
      this.logExecution(startedAt, outcome, raw);
    }
  }

  private buildMessages(text: string, options: RewriteOptions): BaseMessage[] {
    return [
      new SystemMessage(systemPrompt),
      new ChatMessage({ role: 'developer', content: buildDeveloperPrompt(options) }),
      new HumanMessage(text),
    ];
  }

  private validateResponse(raw: BaseMessage, parsed: unknown, startedAt: number): string {
    if (
      raw.additional_kwargs.refusal ||
      (Array.isArray(raw.content) &&
        raw.content.some((block) => typeof block === 'object' && block.type === 'refusal'))
    ) {
      throw new RewriteError(this.buildMetadata(startedAt, 'refused', raw));
    }

    const metadata: Record<string, unknown> = raw.response_metadata;

    if (
      (metadata.status && metadata.status !== 'completed') ||
      metadata.incomplete_details ||
      metadata.finish_reason === 'length' ||
      metadata.finish_reason === 'content_filter'
    ) {
      throw new RewriteError(this.buildMetadata(startedAt, 'incomplete', raw));
    }

    const result = outputSchema.safeParse(parsed);

    if (!result.success) {
      throw new RewriteError(this.buildMetadata(startedAt, 'invalid_output', raw));
    }

    if (!result.data.html.trim()) {
      throw new RewriteError(this.buildMetadata(startedAt, 'empty_output', raw));
    }

    return result.data.html;
  }

  private buildMetadata(
    startedAt: number,
    outcome: string,
    raw?: BaseMessage,
  ): Omit<RewriteResult, 'html'> {
    const usage = AIMessage.isInstance(raw) ? raw.usage_metadata : undefined;

    return {
      model: this.modelName,
      promptVersion,
      durationMs: Date.now() - startedAt,
      inputTokens: usage?.input_tokens,
      outputTokens: usage?.output_tokens,
      outcome,
    };
  }

  private logExecution(startedAt: number, outcome: string, raw?: BaseMessage): void {
    this.logger.log({
      event: 'AI rewrite',
      model: this.modelName,
      durationMs: Date.now() - startedAt,
      tokens: AIMessage.isInstance(raw) ? raw.usage_metadata : undefined,
      outcome,
    });
  }
}

export const rewriteOptionsSchema = z.strictObject({
  mode: z.enum(['translate', 'edit']).default('translate'),
  language: z.enum(['uk', 'en']).default('uk'),
  tone: z.enum(['neutral', 'formal', 'friendly']).default('neutral'),
  length: z.enum(['preserve', 'concise']).default('preserve'),
  removeSource: z.boolean().default(true),
});

export const defaultRewriteOptions = rewriteOptionsSchema.parse({});

const outputSchema = z.strictObject({
  html: z
    .string()
    .describe(
      'The final Telegram post in the requested target language, with Telegram-compatible HTML formatting.',
    ),
});

export type RewriteOptions = z.infer<typeof rewriteOptionsSchema>;

export type RewriteResult = {
  html: string;
  model: string;
  promptVersion: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  outcome: string;
};

export class RewriteError extends Error {
  constructor(public readonly metadata: Omit<RewriteResult, 'html'>) {
    super(`AI rewrite failed: ${metadata.outcome}`);
  }
}
