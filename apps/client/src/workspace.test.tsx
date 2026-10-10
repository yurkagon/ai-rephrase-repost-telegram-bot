import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { api } from './api';
import type * as Components from './components';
import { Workspace } from './workspace';
import { defaults, type Post } from './types';

import './i18n';

vi.mock('./api', () => ({ api: vi.fn(), body: JSON.stringify }));
vi.mock('./components', async (importOriginal) => ({
  ...(await importOriginal<typeof Components>()),
  ChannelAvatar: () => null,
  MediaPreview: () => <span data-testid="media-preview" />,
  RichEditor: ({
    html,
    onChange,
    disabled,
  }: {
    html: string;
    onChange: (html: string) => void;
    disabled: boolean;
  }) => (
    <textarea
      aria-label="Post HTML"
      value={html}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

function fixture(mediaCount: number): Post {
  const channel = {
    id: 'source',
    title: 'Source',
    chatId: '-100123',
    username: null,
    canPublish: true,
  };
  const media = Array.from({ length: mediaCount }, (_, index) => ({
    id: `media-${index}`,
    messageId: index + 1,
    type: 'photo' as const,
    originalCaption: index === 0 ? '<b>Original post</b>' : '',
  }));

  return {
    id: 'post',
    route: {
      id: 'route',
      name: 'Editorial',
      sourceId: 'source',
      targetId: 'target',
      source: channel,
      target: { ...channel, id: 'target', title: 'Target' },
      active: true,
      options: defaults,
    },
    originalHtml: '<b>Original post</b>',
    media,
    revisions: [
      {
        id: 'revision',
        version: 1,
        origin: 'ai',
        html: '<b>Draft</b>',
        captions: media.map((item, index) => ({
          messageId: item.messageId,
          html: index === 0 ? '<b>Draft</b>' : '',
        })),
        createdAt: '2026-10-10T12:00:00Z',
      },
    ],
    revision: 1,
    status: 'DRAFT',
    error: null,
    failureStage: null,
    publishedIds: [],
    createdAt: '2026-10-10T12:00:00Z',
  };
}

function renderPost(post: Post) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  vi.mocked(api).mockImplementation((path) =>
    Promise.resolve(
      path === '/channels/routes'
        ? [post.route]
        : path === '/posts/post'
          ? post
          : { posts: [post], nextCursor: null },
    ),
  );

  const view = render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={['/workspace/post']}>
        <Routes>
          <Route path="/workspace/:postId" element={<Workspace />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return { ...view, cache };
}

beforeEach(() => vi.mocked(api).mockReset());

describe('AI thinking feedback', () => {
  it.each(['DRAFT', 'FAILED'])('stays busy through generation until %s', async (status) => {
    let post = fixture(0);
    const { cache, container } = renderPost(post);
    const button = await screen.findByRole('button', { name: 'Згенерувати знову' });
    let finishRequest!: (value: unknown) => void;
    const request = new Promise((resolve) => {
      finishRequest = resolve;
    });

    expect(button).toHaveAttribute('aria-busy', 'false');
    vi.mocked(api).mockImplementation((path) =>
      path === '/posts/post/generate'
        ? request
        : Promise.resolve(path === '/posts/post' ? post : { posts: [post], nextCursor: null }),
    );
    fireEvent.click(button);

    expect(await screen.findByRole('button', { name: 'AI думає' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('AI думає');
    expect(screen.getByRole('textbox', { name: 'Post HTML' })).toBeDisabled();
    expect(container.querySelectorAll('.ai-thinking-dots span')).toHaveLength(3);

    post = { ...post, status: 'GENERATING', revision: 2 };
    await act(async () => finishRequest({ id: 'operation' }));
    await waitFor(() =>
      expect(cache.getQueryData<Post>(['post', 'post'])?.status).toBe('GENERATING'),
    );

    expect(screen.getByRole('button', { name: 'AI думає' })).toHaveAttribute('aria-busy', 'true');

    post = { ...post, status, revision: 3 };
    await act(async () => {
      await cache.invalidateQueries({ queryKey: ['post', 'post'] });
    });

    expect(await screen.findByRole('button', { name: 'Згенерувати знову' })).toBeEnabled();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(container.querySelector('.ai-thinking-dots')).toBeNull();
  });

  it('clears thinking feedback if starting generation fails', async () => {
    renderPost(fixture(0));
    const button = await screen.findByRole('button', { name: 'Згенерувати знову' });

    vi.mocked(api).mockRejectedValueOnce(new Error('Generation unavailable'));
    fireEvent.click(button);

    expect(await screen.findByText('Generation unavailable')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Згенерувати знову' })).toBeEnabled();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});

describe('one HTML body per post', () => {
  it.each([0, 1, 4])('shows one editor and one preview body for %s media', async (count) => {
    const post = fixture(count);
    const { container } = renderPost(post);
    const editor = await screen.findByRole('textbox', { name: 'Post HTML' });

    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(editor).toHaveValue('<b>Draft</b>');
    expect(container.querySelectorAll('.original-message .telegram-text')).toHaveLength(1);
    expect(container.querySelectorAll('.preview-message .telegram-text')).toHaveLength(1);
    expect(
      container.querySelectorAll('.preview-message [data-testid="media-preview"]'),
    ).toHaveLength(count);

    fireEvent.change(editor, { target: { value: '<b>Edited</b>' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти зміни' }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/posts/post', {
        method: 'PATCH',
        body: JSON.stringify({
          revision: 1,
          html: '<b>Edited</b>',
          captions: post.media.map((media, index) => ({
            messageId: media.messageId,
            html: index === 0 ? '<b>Edited</b>' : '',
          })),
        }),
      }),
    );
  });

  it('shows a single locked editor and one HTML block per saved version in history', async () => {
    const post = { ...fixture(4), status: 'PUBLISHED' };
    const { container } = renderPost(post);

    expect(await screen.findByRole('textbox', { name: 'Post HTML' })).toBeDisabled();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(container.querySelectorAll('.versions .telegram-text')).toHaveLength(1);
    expect(container.querySelectorAll('.caption-editor')).toHaveLength(0);
  });
});
