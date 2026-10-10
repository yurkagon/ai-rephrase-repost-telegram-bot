import { escapers, serialisers, serialiseWith } from '@telegraf/entity';
import { BadRequestException } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';
import { Parser } from 'htmlparser2';

const allowedTags = [
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
  const parser = new Parser(
    {
      ontext(value) {
        text += value;
      },
      onopentag(name, attrs) {
        if (!allowedTags.includes(name)) {
          throw new BadRequestException('Unsupported Telegram HTML tag');
        }

        for (const [key, value] of Object.entries(attrs)) {
          const valid =
            (name === 'a' &&
              key === 'href' &&
              /^(https?:\/\/|tg:\/\/user\?id=\d+$)/i.test(value)) ||
            (name === 'span' && key === 'class' && value === 'tg-spoiler') ||
            (name === 'code' && key === 'class' && /^language-[a-z0-9_+-]+$/i.test(value)) ||
            (name === 'blockquote' && key === 'expandable') ||
            (name === 'tg-emoji' && key === 'emoji-id' && /^\d+$/.test(value));

          if (!valid) {
            throw new BadRequestException('Unsafe or unsupported Telegram HTML attribute');
          }
        }

        if (name === 'a' && !attrs.href) {
          throw new BadRequestException('Link has no URL');
        }

        if (name === 'span' && attrs.class !== 'tg-spoiler') {
          throw new BadRequestException('Unsupported span');
        }
      },
    },
    { decodeEntities: true },
  );

  parser.end(html);

  if (text.length > (caption ? 1024 : 4096))
    throw new BadRequestException('Telegram text length exceeded');

  return sanitizeHtml(html, {
    allowedTags,
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

const escapeAttribute = (text: string) => escapers.HTML(text).replace(/"/g, '&quot;');

// The library skips escaping when a message has no entities; escape that branch explicitly.
export const messageToHtml = serialiseWith((text, node) => {
  if (!node) return escapers.HTML(text);

  let safe = node;

  if (node.type === 'text_link') {
    safe = { ...node, url: escapeAttribute(node.url) };
  } else if (node.type === 'url') {
    safe = { ...node, text: escapeAttribute(node.text) };
  } else if (node.type === 'pre' && node.language) {
    safe = { ...node, language: escapeAttribute(node.language) };
  }

  return serialisers.HTML(text, safe);
}, escapers.HTML);
