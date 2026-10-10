import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Html, OptionsForm } from './components';
import { RichEditor } from './rich-editor';
import { defaults } from './types';
import './i18n';
describe('editor boundaries', () => {
  it('sanitizes a hostile preview without losing safe formatting', () => {
    const { container } = render(
      <Html
        html={
          '<b>Safe</b><img src=x onerror=alert(1)><script>bad</script><a href="javascript:alert(1)">link</a>'
        }
      />,
    );
    expect(screen.getByText('Safe').tagName).toBe('B');
    expect(container.querySelector('script,img')).toBeNull();
    expect(container.querySelector('a')).not.toHaveAttribute('href');
  });
  it('translation locks editorial tone and preserves independently chosen output language', async () => {
    let result = defaults;
    render(
      <OptionsForm
        value={defaults}
        onChange={(v) => {
          result = v;
        }}
      />,
    );
    expect(screen.getByLabelText('Тон')).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Мова результату'), 'en');
    expect(result.language).toBe('en');
    expect(result.mode).toBe('translate');
  });
  it('preserves Telegram quotes and code newlines without treating mount as an edit', async () => {
    const onChange = vi.fn();
    const props = {
      html: '<blockquote expandable>Quoted</blockquote><pre><code class="language-js">a\nb</code></pre>',
      onChange,
    };
    const { container, rerender } = render(<RichEditor {...props} disabled={true} />);
    expect(container.querySelector('blockquote')).toHaveAttribute('expandable');
    expect(container.querySelector('pre code')).toHaveTextContent('a b');
    expect(container.querySelector('pre code')?.textContent).toBe('a\nb');
    rerender(<RichEditor {...props} disabled={false} />);
    expect(onChange).not.toHaveBeenCalled();
  });
});
