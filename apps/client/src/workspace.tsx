import { useEffect, useState, Suspense } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, ChevronDown, Inbox, Send, Sparkles, Trash2 } from 'lucide-react';

import { api, body } from './api';
import type { Options, Post, Route } from './types';
import {
  ChannelAvatar,
  ConfirmDialog,
  ErrorNotice,
  Html,
  Loading,
  MediaPreview,
  OptionsForm,
  RichEditor,
} from './components';
import { edits } from './editor-state';

export function Workspace() {
  const { t } = useTranslation();
  const { postId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const routeId = params.get('routeId') ?? '';
  const history = location.pathname.startsWith('/history');
  const routes = useQuery({
    queryKey: ['routes'],
    queryFn: () => api<Route[]>('/channels/routes'),
  });
  const posts = useInfiniteQuery({
    queryKey: ['posts', routeId, history],
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      api<{ posts: Post[]; nextCursor: string | null }>(
        `/posts?view=${history ? 'history' : 'inbox'}${routeId ? `&routeId=${routeId}` : ''}${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    getNextPageParam: (result) => result.nextCursor ?? undefined,
    refetchInterval: 3000,
  });
  const selected = useQuery({
    queryKey: ['post', postId],
    queryFn: () => api<Post>(`/posts/${postId}`),
    enabled: Boolean(postId),
    refetchInterval: 2000,
  });
  const move = (id: string) => {
    if (!edits.dirty || window.confirm(t('discard')))
      navigate(
        `/${history ? 'history' : 'workspace'}/${id}${routeId ? `?routeId=${routeId}` : ''}`,
      );
  };

  return (
    <div className={`workspace ${postId ? 'has-selection' : ''}`}>
      <section className="inbox-pane">
        <header>
          <h1>{t(history ? 'history' : 'inbox')}</h1>
          <span className="live-dot" aria-hidden="true" />
        </header>
        <label className="route-filter">
          <span className="sr-only">{t('routes')}</span>
          <select
            value={routeId}
            onChange={(e) => {
              if (!edits.dirty || window.confirm(t('discard')))
                setParams(e.target.value ? { routeId: e.target.value } : {});
            }}
          >
            <option value="">{t('allRoutes')}</option>
            {routes.data?.map((route) => (
              <option value={route.id} key={route.id}>
                {route.name}
              </option>
            ))}
          </select>
        </label>
        <ErrorNotice error={posts.error} />
        {posts.isLoading ? (
          <Loading />
        ) : posts.isError ? (
          <button className="secondary" onClick={() => void posts.refetch()}>
            {t('retry')}
          </button>
        ) : posts.data?.pages[0].posts.length === 0 ? (
          <div className="empty inbox-empty">
            <Inbox size={34} />
            <h2>{t('noPosts')}</h2>
            <p>{t('noPostsHint')}</p>
            <Link className="button secondary" to="/channels">
              {t('channels')}
            </Link>
          </div>
        ) : (
          <div className="post-list">
            {posts.data?.pages
              .flatMap((page) => page.posts)
              .map((post) => (
                <button
                  className={`post-row ${post.id === postId ? 'selected' : ''}`}
                  key={post.id}
                  onClick={() => move(post.id)}
                >
                  <ChannelAvatar channel={post.route.target} />
                  <span className="post-row-copy">
                    <span className="post-row-heading">
                      <strong>{post.route.target.title}</strong>
                      <time>{new Date(post.createdAt).toLocaleDateString()}</time>
                    </span>
                    <span className="post-excerpt">
                      {post.originalHtml.replace(/<[^>]*>/g, '').slice(0, 100) ||
                        `${post.media.length} ${t('media')}`}
                    </span>
                    <span className={`status status-${post.status.toLowerCase()}`}>
                      {t(post.status)}
                    </span>
                  </span>
                </button>
              ))}
          </div>
        )}
        {posts.hasNextPage && (
          <button
            className="secondary load-more"
            disabled={posts.isFetchingNextPage}
            onClick={() => void posts.fetchNextPage()}
          >
            <ChevronDown size={16} />
            {t('loadMore')}
          </button>
        )}
      </section>
      <section className="detail-pane">
        {selected.isLoading && postId ? (
          <Loading />
        ) : selected.error ? (
          <ErrorNotice error={selected.error} />
        ) : selected.data ? (
          <PostEditor key={selected.data.id} post={selected.data} back={() => move('')} />
        ) : (
          <div className="empty selection-empty">
            <Send size={46} />
            <h2>{t('selectPost')}</h2>
            <p>{t('selectHint')}</p>
            {routes.data?.length === 0 && (
              <Link className="button primary" to="/routes">
                {t('createRoute')}
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function PostEditor({ post, back }: { post: Post; back: () => void }) {
  const { t } = useTranslation();
  const cache = useQueryClient();
  const revision = post.revisions[0];
  const originalHtml =
    post.media.find((media) => media.originalCaption.trim())?.originalCaption ?? post.originalHtml;
  const [html, setHtml] = useState(revision?.html ?? originalHtml);
  const [draftId, setDraftId] = useState(revision?.id);
  const [options, setOptions] = useState<Options>(post.route.options);
  const [dirty, setDirty] = useState(false);
  const [confirmation, setConfirmation] = useState<'publish' | 'discard' | null>(null);
  const locked = [
    'GENERATING',
    'PUBLISHING',
    'PUBLISHED',
    'PUBLICATION_UNKNOWN',
    'SKIPPED',
  ].includes(post.status);

  if (draftId !== revision?.id) {
    setDraftId(revision?.id);
    setHtml(revision?.html ?? originalHtml);
    setDirty(false);
  }

  useEffect(() => {
    edits.dirty = dirty;

    const unload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };

    window.addEventListener('beforeunload', unload);

    return () => {
      edits.dirty = false;
      window.removeEventListener('beforeunload', unload);
    };
  }, [dirty]);

  const invalidate = () => {
    setDirty(false);

    return Promise.all([
      cache.invalidateQueries({ queryKey: ['post', post.id] }),
      cache.invalidateQueries({ queryKey: ['posts'] }),
    ]);
  };
  const generate = useMutation({
    mutationFn: () =>
      api(`/posts/${post.id}/generate`, {
        method: 'POST',
        body: body({ revision: post.revision, options }),
      }),
    onSuccess: invalidate,
  });
  const save = useMutation({
    mutationFn: () =>
      api(`/posts/${post.id}`, {
        method: 'PATCH',
        body: body({
          revision: post.revision,
          html,
          captions: post.media.map((media, index) => ({
            messageId: media.messageId,
            html: index === 0 ? html : '',
          })),
        }),
      }),
    onSuccess: invalidate,
  });
  const publish = useMutation({
    mutationFn: () =>
      api(`/posts/${post.id}/publish`, { method: 'POST', body: body({ revision: post.revision }) }),
    onSuccess: () => {
      setConfirmation(null);
      invalidate();
    },
  });
  const resolve = useMutation({
    mutationFn: (published: boolean) =>
      api(`/posts/${post.id}/resolve`, { method: 'POST', body: body({ published }) }),
    onSuccess: invalidate,
  });
  const discard = useMutation({
    mutationFn: () =>
      api(`/posts/${post.id}/discard`, {
        method: 'POST',
        body: body({ revision: post.revision }),
      }),
    onSuccess: async () => {
      edits.dirty = false;
      setDirty(false);
      back();
      cache.removeQueries({ queryKey: ['post', post.id] });
      await cache.invalidateQueries({ queryKey: ['posts'] });
    },
  });
  const working =
    generate.isPending ||
    save.isPending ||
    publish.isPending ||
    resolve.isPending ||
    discard.isPending;
  const generating = generate.isPending || post.status === 'GENERATING';

  return (
    <>
      <header className="detail-header">
        <button className="icon-button mobile-back" aria-label={t('inbox')} onClick={back}>
          <ArrowLeft size={20} />
        </button>
        <ChannelAvatar channel={post.route.target} />
        <div>
          <strong>{post.route.target.title}</strong>
          <small>
            {post.route.source.title} → {post.route.target.title}
          </small>
        </div>
        <span className={`status status-${post.status.toLowerCase()}`}>{t(post.status)}</span>
      </header>
      <div className="detail-scroll">
        <ErrorNotice
          error={
            generate.error ??
            save.error ??
            publish.error ??
            resolve.error ??
            discard.error ??
            post.error
          }
        />
        {post.status === 'PUBLICATION_UNKNOWN' && (
          <div className="unknown-state">
            <p>{t('unknown')}</p>
            {[true, false].map((published) => (
              <button
                key={String(published)}
                className="secondary"
                disabled={working}
                onClick={() => {
                  if (window.confirm(t('checkedConfirm'))) resolve.mutate(published);
                }}
              >
                {t(published ? 'confirmPublished' : 'confirmNotPublished')}
              </button>
            ))}
          </div>
        )}
        <div className="source-section">
          <div className="section-label">
            <h2>{t('original')}</h2>
            <time>{new Date(post.createdAt).toLocaleString()}</time>
          </div>
          <div className="message original-message">
            {post.media.length > 0 && (
              <div
                className={`media-gallery${post.media.length > 1 ? ' media-gallery-album' : ''}`}
              >
                {post.media.map((media) => (
                  <MediaPreview key={media.id} postId={post.id} media={media} />
                ))}
              </div>
            )}
            <Html html={originalHtml} />
          </div>
        </div>
        {!['PUBLISHED', 'PUBLICATION_UNKNOWN', 'SKIPPED'].includes(post.status) && (
          <div className="ai-controls">
            <OptionsForm value={options} onChange={setOptions} disabled={locked || working} />
            <button
              className="ai-button"
              aria-busy={generating}
              disabled={locked || working}
              onClick={() => {
                if (!dirty || window.confirm(t('discard'))) generate.mutate();
              }}
            >
              <Sparkles size={17} />
              {generating ? (
                <>
                  {t('thinking')}
                  <span className="ai-thinking-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </>
              ) : (
                t(revision ? 'regenerate' : 'generate')
              )}
            </button>
            <span role="status" className="sr-only">
              {generating ? t('thinking') : ''}
            </span>
          </div>
        )}
        <div className="draft-section" aria-busy={generating}>
          <Suspense fallback={<Loading />}>
            <div className="section-label">
              <h2>{t('draft')}</h2>
              {dirty && <span>{t('unsaved')}</span>}
            </div>
            <RichEditor
              html={html}
              onChange={(value) => {
                setHtml(value);
                setDirty(true);
              }}
              disabled={locked || working}
            />
            <div className="section-label">
              <h2>{t('preview')}</h2>
            </div>
            <div className="message preview-message">
              <strong className="preview-channel">{post.route.target.title}</strong>
              {post.media.length > 0 && (
                <div
                  className={`media-gallery${post.media.length > 1 ? ' media-gallery-album' : ''}`}
                >
                  {post.media.map((media) => (
                    <MediaPreview key={media.id} postId={post.id} media={media} />
                  ))}
                </div>
              )}
              <Html html={html} />
              <small className="message-time">
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                <Check size={14} />
              </small>
            </div>
          </Suspense>
        </div>
        {post.revisions.length > 0 && (
          <details className="versions">
            <summary>
              {t('versions')} · {post.revisions.length}
            </summary>
            {post.revisions.map((item) => (
              <div key={item.id}>
                <strong>
                  v{item.version} · {t(item.origin === 'ai' ? 'aiVersion' : 'manualVersion')}
                </strong>
                <small>{new Date(item.createdAt).toLocaleString()}</small>
                <Html html={item.html} />
              </div>
            ))}
          </details>
        )}
      </div>
      {!['PUBLISHED', 'PUBLICATION_UNKNOWN', 'SKIPPED'].includes(post.status) && (
        <footer className="editor-actions">
          <button
            className="secondary destructive"
            disabled={locked || working}
            onClick={() => setConfirmation('discard')}
          >
            <Trash2 size={16} />
            {t('discardPost')}
          </button>
          <button
            className="secondary"
            disabled={
              locked || working || (!dirty && Boolean(revision) && post.status !== 'FAILED')
            }
            onClick={() => save.mutate()}
          >
            {t('save')}
          </button>
          <button
            className="primary"
            disabled={post.status !== 'DRAFT' || dirty || working}
            title={dirty ? t('saveFirst') : undefined}
            onClick={() => setConfirmation('publish')}
          >
            <Send size={16} />
            {t('publish')}
          </button>
        </footer>
      )}
      {confirmation && (
        <ConfirmDialog onCancel={() => setConfirmation(null)}>
          <h2 id="confirm-title">
            {t(confirmation === 'discard' ? 'discardPostConfirm' : 'publishConfirm')}
          </h2>
          <p>{confirmation === 'discard' ? t('discardPostHint') : post.route.target.title}</p>
          <button
            data-autofocus={confirmation === 'publish' || undefined}
            className={confirmation === 'discard' ? 'secondary destructive' : 'primary'}
            disabled={working}
            onClick={() => (confirmation === 'discard' ? discard.mutate() : publish.mutate())}
          >
            {t(confirmation === 'discard' ? 'discardPost' : 'publish')}
          </button>
          <button
            data-autofocus={confirmation === 'discard' || undefined}
            className="secondary"
            disabled={working}
            onClick={() => setConfirmation(null)}
          >
            {t('cancel')}
          </button>
          <ErrorNotice error={confirmation === 'discard' ? discard.error : publish.error} />
        </ConfirmDialog>
      )}
    </>
  );
}
