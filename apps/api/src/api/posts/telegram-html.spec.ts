import { telegramHtml, messageToHtml } from './telegram-html';

it('preserves Telegram formatting, meaningful links and decoded length', () => {
  expect(telegramHtml('<b>Hello</b> <a href="https://example.com">site</a>')).toContain(
    '<b>Hello</b>',
  );
  expect(() => telegramHtml('&amp;'.repeat(1024), true)).not.toThrow();
});

it.each([
  '<script>alert(1)</script>',
  '<a href="javascript:alert(1)">x</a>',
  '<b onclick="alert(1)">x</b>',
  '<img src="x">',
  '<span>x</span>',
])('rejects unsafe or unsupported markup %s', (html) => expect(() => telegramHtml(html)).toThrow());

it('rejects oversized messages and captions', () => {
  expect(() => telegramHtml('x'.repeat(4097))).toThrow('length');
  expect(() => telegramHtml('x'.repeat(1025), true)).toThrow('length');
});

it('escapes plaintext and entity URL attributes at the Telegram boundary', () => {
  expect(messageToHtml({ text: '<Hello> & world' })).toBe('&lt;Hello&gt; &amp; world');
  expect(
    messageToHtml({
      text: 'link',
      entities: [{ type: 'text_link', offset: 0, length: 4, url: 'https://example.com/?q="word"' }],
    }),
  ).toContain('&quot;word&quot;');
});
