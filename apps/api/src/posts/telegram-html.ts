import { escapers, serialisers, serialiseWith } from '@telegraf/entity';
import { BadRequestException } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';
import { Parser } from 'htmlparser2';
const allowed = [
  'b',
  'strong',
  'i',
  'em',
  'u',
  'ins',
  's',
  'strike',
  'del',
  'span',
  'tg-spoiler',
  'a',
  'code',
  'pre',
  'blockquote',
  'tg-emoji',
];
export function telegramHtml(html: string, caption = false): string {
  let text = '';
  let problem = '';
  const parser = new Parser(
    {
      ontext(value) {
        text += value;
      },
      onopentag(name, attrs) {
        if (!allowed.includes(name)) problem = 'Unsupported Telegram HTML tag';
        for (const [key, value] of Object.entries(attrs)) {
          const valid =
            (name === 'a' &&
              key === 'href' &&
              /^(https?:\/\/|tg:\/\/user\?id=\d+$)/i.test(value)) ||
            (name === 'span' && key === 'class' && value === 'tg-spoiler') ||
            (name === 'code' && key === 'class' && /^language-[a-z0-9_+-]+$/i.test(value)) ||
            (name === 'blockquote' && key === 'expandable') ||
            (name === 'tg-emoji' && key === 'emoji-id' && /^\d+$/.test(value));
          if (!valid) problem = 'Unsafe or unsupported Telegram HTML attribute';
        }
        if (name === 'a' && !attrs.href) problem = 'Link has no URL';
        if (name === 'span' && attrs.class !== 'tg-spoiler') problem = 'Unsupported span';
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();
  if (problem) throw new BadRequestException(problem);
  if (text.length > (caption ? 1024 : 4096))
    throw new BadRequestException('Telegram text length exceeded');
  return sanitizeHtml(html, {
    allowedTags: allowed,
    allowedAttributes: {
      a: ['href'],
      span: ['class'],
      code: ['class'],
      blockquote: ['expandable'],
      'tg-emoji': ['emoji-id'],
    },
    allowedSchemes: ['http', 'https', 'tg'],
    allowProtocolRelative: false,
  });
}

const attribute = (text: string) => escapers.HTML(text).replace(/"/g, '&quot;');
// The library skips escaping when a message has no entities; escape that branch explicitly.
export const messageToHtml = serialiseWith((text, node) => {
  if (!node) return escapers.HTML(text);
  const safe =
    node.type === 'text_link'
      ? { ...node, url: attribute(node.url) }
      : node.type === 'url'
        ? { ...node, text: attribute(node.text) }
        : node.type === 'pre' && node.language
          ? { ...node, language: attribute(node.language) }
          : node;
  return serialisers.HTML(text, safe);
}, escapers.HTML);
