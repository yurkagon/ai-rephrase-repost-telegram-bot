import { RewriteError, rewriteOptionsSchema, type RewriteResult } from '@/ai/ai.service';
import { buildDeveloperPrompt } from '@/ai/prompts/rewrite';

import { cases } from './cases';
import { runEvals } from './run';

const metadata = {
  model: 'test-model',
  promptVersion: 'test-prompt',
  durationMs: 123,
  inputTokens: 40,
  outputTokens: 20,
  outcome: 'success',
};

const response = (html: string): RewriteResult => ({ html, ...metadata });

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

it.each([
  ['emoji', 'Nova випустила оновлення.', 'adds requested emoji'],
  [
    'post-overrides-route',
    'Nova випустила 7 виправлень.',
    'post style takes priority over route style',
  ],
  [
    'uk-facts',
    'NVIDIA випустила 3 карти 12 жовтня 2026 року за 2500 доларів.',
    'keeps NVIDIA and all numbers',
  ],
  [
    'deep-rewrite',
    'Nova today announced an update to its mobile app with 7 fixes.',
    'changes the original opening words',
  ],
])('fails %s when the generated output ignores its rule', async (id, html, failure) => {
  const sample = cases.find((sample) => sample.id === id)!;
  const rewrite = jest.fn().mockResolvedValue(response(html));
  const report = await runEvals({ rewrite }, [sample]);

  expect(report.passed).toBe(0);
  expect(report.results[0].errors).toContain(failure);
  expect(report.results[0].output?.html).toBe(html);
});

it('passes actual generation settings through and retains output, prompts and execution metadata', async () => {
  const sample = cases.find((sample) => sample.id === 'post-overrides-route')!;
  const result = response('<b>Nova</b> отримала 7 виправлень. 🎉 🚀');
  const rewrite = jest.fn().mockResolvedValue(result);
  const report = await runEvals({ rewrite }, [sample]);
  const options = rewriteOptionsSchema.parse(sample.options);

  expect(rewrite).toHaveBeenCalledTimes(1);
  expect(rewrite).toHaveBeenCalledWith(sample.input, options);
  expect(report.passed).toBe(1);
  expect(report.results[0]).toMatchObject({
    input: sample.input,
    options,
    developerPrompt: buildDeveloperPrompt(options),
    output: result,
    review: sample.review,
    errors: [],
  });
});

it('reports a refusal without retrying the case or losing execution metadata', async () => {
  const rewrite = jest
    .fn()
    .mockRejectedValue(new RewriteError({ ...metadata, outcome: 'refused' }));
  const report = await runEvals({ rewrite }, [cases[0]]);

  expect(rewrite).toHaveBeenCalledTimes(1);
  expect(report.passed).toBe(0);
  expect(report.results[0]).toMatchObject({
    errors: ['refused'],
    output: { durationMs: 123, inputTokens: 40, outcome: 'refused' },
  });
});

it('stops on a provider failure and marks the run incomplete instead of passing unexecuted cases', async () => {
  const rewrite = jest
    .fn()
    .mockRejectedValue(new RewriteError({ ...metadata, outcome: 'provider_error' }));
  const report = await runEvals({ rewrite }, cases.slice(0, 2));

  expect(rewrite).toHaveBeenCalledTimes(1);
  expect(report).toMatchObject({ total: 2, executed: 1, passed: 0 });
  expect(report.results[0].errors).toEqual(['provider_error']);
});
