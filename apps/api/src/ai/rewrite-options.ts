import { z } from 'zod';

export const rewriteOptionsSchema = z.strictObject({
  mode: z.enum(['translate', 'edit']).default('translate'),
  language: z.enum(['uk', 'en']).default('uk'),
  tone: z.enum(['neutral', 'formal', 'friendly']).default('neutral'),
  length: z.enum(['preserve', 'concise']).default('preserve'),
  removeSource: z.boolean().default(true),
});

export type RewriteOptions = z.infer<typeof rewriteOptionsSchema>;

export const defaultRewriteOptions = rewriteOptionsSchema.parse({});

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
