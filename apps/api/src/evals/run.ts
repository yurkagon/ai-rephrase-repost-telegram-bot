import 'reflect-metadata';

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { loadEnvFile } from 'node:process';
import { parseArgs } from 'node:util';
import { ConfigService } from '@nestjs/config';
import { Parser } from 'htmlparser2';

import { AiService, RewriteError, rewriteOptionsSchema, type RewriteResult } from '@/ai/ai.service';
import { systemPrompt, promptVersion, buildDeveloperPrompt } from '@/ai/prompts/rewrite';
import { environmentSchema } from '@/config/env.schema';
import { telegramHtml } from '@/telegram/telegram-html';

import { cases, type EvalCase } from './cases';

export async function runEvals(ai: Pick<AiService, 'rewrite'>, samples: EvalCase[]) {
  const results = [];

  for (const sample of samples) {
    const options = rewriteOptionsSchema.parse(sample.options ?? {});
    const errors: string[] = [];
    let output: Partial<RewriteResult> | undefined;

    try {
      const result = await ai.rewrite(sample.input, options);
      output = result;
      try {
        telegramHtml(result.html, sample.caption);
      } catch {
        errors.push('invalid_telegram_html_or_length');
      }

      let text = '';
      new Parser(
        {
          ontext: (value) => {
            text += value;
          },
        },
        { decodeEntities: true },
      ).end(result.html);

      if (!text.trim()) errors.push('empty_post');

      const hasCyrillic = /\p{Script=Cyrillic}/u.test(text);

      if (options.language === 'en' ? hasCyrillic : !hasCyrillic) {
        errors.push('unexpected_language_signal');
      }

      for (const check of sample.checks) {
        if (!check.test(result.html, text)) errors.push(check.name);
      }
    } catch (error) {
      if (error instanceof RewriteError) {
        output = error.metadata;
        errors.push(error.metadata.outcome);
      } else {
        errors.push(error instanceof Error ? error.name : 'unexpected_error');
      }
    }

    results.push({
      id: sample.id,
      input: sample.input,
      options,
      developerPrompt: buildDeveloperPrompt(options),
      output,
      errors,
      review: sample.review,
    });

    console.log(
      `${errors.length ? 'FAIL' : 'PASS'} ${sample.id}${errors.length ? `: ${errors.join(', ')}` : ''}`,
    );

    if (output?.outcome === 'provider_error') break;
  }

  return {
    promptVersion,
    systemPrompt,
    total: samples.length,
    executed: results.length,
    passed: results.filter((result) => result.errors.length === 0).length,
    results,
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      'budget-calls': { type: 'string' },
      case: { type: 'string' },
      out: { type: 'string', default: `eval-reports/${promptVersion}-${Date.now()}.json` },
    },
  });
  const selected = values.case ? cases.filter((sample) => sample.id === values.case) : cases;
  const budget = Number(values['budget-calls']);

  if (!selected.length)
    throw new Error(`Unknown case. Available: ${cases.map((sample) => sample.id).join(', ')}`);
  if (!Number.isSafeInteger(budget) || budget < selected.length) {
    throw new Error(
      `Real model requests require --budget-calls ${selected.length} or more. Transport retries may add requests.`,
    );
  }
  if (!values.out.endsWith('.json')) throw new Error('--out must be a .json path');

  if (existsSync('../../.env')) loadEnvFile('../../.env');

  const environment = environmentSchema
    .pick({ OPENAI_API_KEY: true, LLM_MODEL: true })
    .parse(process.env);

  await mkdir(dirname(values.out), { recursive: true });

  const ai = new AiService(new ConfigService(environment));
  const report = {
    model: environment.LLM_MODEL,
    createdAt: new Date().toISOString(),
    ...(await runEvals(ai, selected)),
  };

  await writeFile(values.out, `${JSON.stringify(report, null, 2)}\n`);

  console.log(
    `${report.passed}/${report.total} checks passed; ${report.executed} generations. Report: ${values.out}`,
  );
  console.log(
    'Review the input and output against each case review note; automatic checks do not prove semantic quality.',
  );

  if (report.passed !== report.total) process.exitCode = 1;
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Eval run failed');
    process.exitCode = 1;
  });
}
