import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

import { rewriteOptionsSchema } from '@/ai/ai.service';

import { evaluate, evalCaseSchema } from './evaluate';

const data = z
  .array(evalCaseSchema.extend({ options: rewriteOptionsSchema }))
  .parse(JSON.parse(readFileSync(join(__dirname, 'dataset.json'), 'utf8')));

it('has 40 diverse valid rewrite references covering both languages and all strengths', () => {
  expect(data.length).toBeGreaterThanOrEqual(40);

  for (const item of data)
    expect(evaluate(item, item.reference)).toEqual({ pass: true, errors: [] });

  expect(new Set(data.map((item) => item.id)).size).toBe(data.length);
  expect(new Set(data.map((item) => item.options.language))).toEqual(new Set(['uk', 'en']));
  expect(new Set(data.map((item) => item.options.rewriteStrength))).toEqual(
    new Set(['light', 'balanced', 'deep']),
  );
});

it('detects removed facts and semantic links', () => {
  const linked = data.find((item) => item.links.length)!;

  expect(evaluate(linked, 'Nothing relevant').errors).toContain(`missing_link:${linked.links[0]}`);

  const factual = data.find((item) => item.facts.length)!;

  expect(evaluate(factual, 'Nothing relevant').errors).toContain(
    `missing_fact:${factual.facts[0]}`,
  );
});
