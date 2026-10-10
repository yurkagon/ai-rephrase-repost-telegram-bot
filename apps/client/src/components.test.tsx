import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';

import * as api from './api';
import { ChannelAvatar, ErrorNotice, Html, OptionsForm } from './components';
import { RichEditor } from './rich-editor';
import { defaults } from './types';

import i18n from './i18n';

describe('channel avatars', () => {
  const channel = {
    id: 'channel',
    title: 'Tech news',
    chatId: '-100123',
    username: null,
    canPublish: true,
  };
  const createUrl = vi.fn(() => 'blob:channel-photo');
  const revokeUrl = vi.fn();

  beforeEach(() => {
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = createUrl;
        static revokeObjectURL = revokeUrl;
      },
    );
    createUrl.mockClear();
    revokeUrl.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function renderAvatar() {
    return render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } })}>
        <ChannelAvatar channel={channel} />
      </QueryClientProvider>,
    );
  }

  it('loads an authenticated blob and revokes its URL on unmount', async () => {
    const load = vi.spyOn(api, 'mediaBlob').mockResolvedValue(new Blob(['photo']));
    const { container, unmount } = renderAvatar();

    await waitFor(() =>
      expect(container.querySelector('img')).toHaveAttribute('src', 'blob:channel-photo'),
    );
    expect(load).toHaveBeenCalledWith('/channels/channel/avatar', expect.any(AbortSignal));
    expect(container.querySelector('img')).toHaveAttribute('alt', '');

    unmount();

    expect(revokeUrl).toHaveBeenCalledWith('blob:channel-photo');
  });

  it('keeps the initial when there is no photo or downloading fails', async () => {
    const load = vi.spyOn(api, 'mediaBlob').mockRejectedValue(new Error('Channel has no photo'));
    const { container } = renderAvatar();

    await waitFor(() => expect(load).toHaveBeenCalledOnce());
    expect(container.querySelector('.channel-avatar')).toHaveTextContent('T');
    expect(container.querySelector('img')).toBeNull();
  });

  it('falls back to the initial if the browser cannot decode the photo', async () => {
    vi.spyOn(api, 'mediaBlob').mockResolvedValue(new Blob(['invalid photo']));
    const { container } = renderAvatar();

    await waitFor(() =>
      expect(container.querySelector('img')).toHaveAttribute('src', 'blob:channel-photo'),
    );

    fireEvent.error(container.querySelector('img')!);

    expect(container.querySelector('img')).toHaveAttribute('hidden');
    expect(container.querySelector('.channel-avatar')).toHaveTextContent('T');
  });
});

describe('channel access errors', () => {
  it('translates the recovery instruction and preserves unknown errors', async () => {
    const originalLanguage = i18n.language;

    try {
      await i18n.changeLanguage('uk');

      const { rerender } = render(
        <ErrorNotice
          error={
            new Error(
              'Channel unavailable. Check the username or ID and add the bot as a channel administrator, then try again.',
            )
          }
        />,
      );

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Канал недоступний. Перевірте username або ID та додайте бота адміністратором',
      );

      await i18n.changeLanguage('en');

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Check the username or ID and add the bot',
      );

      rerender(<ErrorNotice error={new Error('Connection failed')} />);

      expect(screen.getByRole('alert')).toHaveTextContent('Connection failed');
    } finally {
      await i18n.changeLanguage(originalLanguage);
    }
  });
});

describe('editor boundaries', () => {
  it('updates a server draft without remounting the editor or marking it as a manual edit', () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <StrictMode>
        <RichEditor html="Old draft" onChange={onChange} disabled={false} />
      </StrictMode>,
    );
    const textbox = container.querySelector('.tiptap');

    rerender(
      <StrictMode>
        <RichEditor
          html={'<b>New draft</b>\nSecond line\n<pre><code>a\nb</code></pre>'}
          onChange={onChange}
          disabled={false}
        />
      </StrictMode>,
    );

    expect(container.querySelector('.tiptap')).toBe(textbox);
    expect(textbox).toHaveTextContent('New draft');
    expect(container.querySelector('br')).not.toBeNull();
    expect(container.querySelector('pre code')?.textContent).toBe('a\nb');
    expect(onChange).not.toHaveBeenCalled();
  });

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
  it('always exposes rewrite settings and preserves independently chosen output language', async () => {
    let result = defaults;

    render(
      <OptionsForm
        value={defaults}
        onChange={(v) => {
          result = v;
        }}
      />,
    );
    expect(screen.queryByLabelText('Режим AI')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Тон')).toBeEnabled();
    expect(screen.getByLabelText('Довжина')).toBeEnabled();
    expect(screen.getByLabelText('Ступінь рерайту')).toBeEnabled();
    await userEvent.selectOptions(screen.getByLabelText('Мова результату'), 'en');
    expect(result.language).toBe('en');
    expect(result).not.toHaveProperty('mode');
  });
  it('defaults legacy options to moderate strength and edits strength independently from language', async () => {
    const onChange = vi.fn();
    const legacy = {
      language: 'en' as const,
      tone: 'neutral' as const,
      length: 'preserve' as const,
      removeSource: true,
    };
    const { rerender } = render(<OptionsForm value={legacy} onChange={onChange} />);
    const strength = screen.getByLabelText('Ступінь рерайту');

    expect(strength).toHaveValue('balanced');
    expect(strength).toHaveAccessibleDescription(/Нові формулювання/);
    await userEvent.selectOptions(strength, 'deep');
    expect(onChange).toHaveBeenCalledWith({ ...legacy, rewriteStrength: 'deep' });

    rerender(<OptionsForm value={{ ...legacy, rewriteStrength: 'deep' }} onChange={onChange} />);
    expect(strength).toHaveAccessibleDescription(/Новий початок, структура/);

    rerender(
      <OptionsForm value={{ ...legacy, rewriteStrength: 'deep' }} onChange={onChange} disabled />,
    );
    expect(strength).toBeDisabled();
  });

  it('edits optional route rules, preserves other settings and disables the field with the form', () => {
    const onChange = vi.fn();
    const props = { value: defaults, onChange, showCustomInstructions: true };
    const { rerender } = render(<OptionsForm {...props} />);
    const field = screen.getByLabelText('Правила рерайту (необов’язково)');

    expect(field).toHaveValue('');
    expect(field).toHaveAttribute('maxlength', '2000');
    expect(field).toHaveAccessibleDescription(/До 2000 символів/);
    fireEvent.change(field, { target: { value: 'Без емодзі.' } });
    expect(onChange).toHaveBeenCalledWith({ ...defaults, customInstructions: 'Без емодзі.' });

    rerender(
      <OptionsForm
        {...props}
        value={{ ...defaults, customInstructions: 'Без емодзі.' }}
        disabled
      />,
    );
    expect(field).toHaveValue('Без емодзі.');
    expect(field).toBeDisabled();

    rerender(<OptionsForm value={defaults} onChange={onChange} />);
    expect(screen.queryByLabelText('Правила рерайту (необов’язково)')).not.toBeInTheDocument();
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
