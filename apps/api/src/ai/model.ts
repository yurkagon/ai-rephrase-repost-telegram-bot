import { ChatOpenAI, OpenAIClient } from '@langchain/openai';
import { getRetryable } from '@langchain/core/errors';
import { ConfigService } from '@nestjs/config';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

import type { Environment } from '@/config/env.schema';

export function createLanguageModel(config: ConfigService<Environment>): BaseChatModel {
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
