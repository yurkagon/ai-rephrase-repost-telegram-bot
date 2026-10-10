import { z } from 'zod';

import { telegramHtml } from '@/telegram/telegram-html';

export type EvalCase = {
  id: string;
  input: string;
  reference: string;
  facts: string[];
  links: string[];
  removedLinks: string[];
  caption: boolean;
};

export function evaluate(item: EvalCase, html: string) {
  const errors: string[] = [];

  try {
    telegramHtml(html, item.caption);
  } catch {
    errors.push('invalid_html_or_length');
  }

  for (const fact of item.facts) if (!html.includes(fact)) errors.push(`missing_fact:${fact}`);

  for (const link of item.links) if (!html.includes(link)) errors.push(`missing_link:${link}`);

  for (const link of item.removedLinks)
    if (html.includes(link)) errors.push(`source_not_removed:${link}`);

  if (!html.trim()) errors.push('empty');

  return { pass: errors.length === 0, errors };
}

export const evalCaseSchema = z.object({
  id: z.string(),
  input: z.string(),
  reference: z.string(),
  facts: z.array(z.string()),
  links: z.array(z.string()),
  removedLinks: z.array(z.string()),
  caption: z.boolean(),
});
