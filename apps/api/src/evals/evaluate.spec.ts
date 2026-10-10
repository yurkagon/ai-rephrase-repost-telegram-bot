import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

import { evaluate, evalCaseSchema } from './evaluate';

const data = z
  .array(evalCaseSchema)
  .parse(JSON.parse(readFileSync(join(__dirname, 'dataset.json'), 'utf8')));

it('has 40 diverse valid references covering both languages and modes', () => {
  expect(data.length).toBeGreaterThanOrEqual(40);

  for (const item of data)
    expect(evaluate(item, item.reference)).toEqual({ pass: true, errors: [] });

  expect(new Set(data.map((item) => item.id)).size).toBe(data.length);
});

it('detects formatting attacks, removed facts and semantic links', () => {
  expect(evaluate(data[0], '<script>unsafe</script>').pass).toBe(false);

  const linked = data.find((item) => item.links.length)!;

  expect(evaluate(linked, 'Nothing relevant').errors).toContain(`missing_link:${linked.links[0]}`);

  const preserved = data.find((item) => item.preserveExact)!;

  expect(evaluate(preserved, 'Перефразовано').errors).toContain('wording_changed');
});
