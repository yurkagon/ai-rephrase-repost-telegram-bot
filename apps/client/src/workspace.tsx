import { useEffect, useState, Suspense } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, ChevronDown, Inbox, Send, Sparkles } from 'lucide-react';

import { api, body } from './api';
import type { Caption, Options, Post, Route } from './types';
import {
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
                  <span className="channel-avatar">{post.route.source.title.slice(0, 1)}</span>
                  <span className="post-row-copy">
                    <span className="post-row-heading">
                      <strong>{post.route.source.title}</strong>
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
          <PostEditor
            key={`${selected.data.id}:${selected.data.revision}:${selected.data.status}`}
            post={selected.data}
            back={() => move('')}
          />
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
  const [html, setHtml] = useState(revision?.html ?? post.originalHtml);
  const [captions, setCaptions] = useState<Caption[]>(
    revision?.captions ??
      post.media.map((m) => ({ messageId: m.messageId, html: m.originalCaption })),
  );
  const [options, setOptions] = useState<Options>(post.route.options);
  const [dirty, setDirty] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const locked = ['GENERATING', 'PUBLISHING', 'PUBLISHED', 'PUBLICATION_UNKNOWN'].includes(
    post.status,
  );

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
    void cache.invalidateQueries({ queryKey: ['post', post.id] });
    void cache.invalidateQueries({ queryKey: ['posts'] });
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
        body: body({ revision: post.revision, html, captions }),
      }),
    onSuccess: invalidate,
  });
  const publish = useMutation({
    mutationFn: () =>
      api(`/posts/${post.id}/publish`, { method: 'POST', body: body({ revision: post.revision }) }),
    onSuccess: () => {
      setConfirmation(false);
      invalidate();
    },
  });
  const rate = useMutation({
    mutationFn: (rating: number) =>
      api(`/posts/${post.id}/rating`, { method: 'POST', body: body({ rating }) }),
    onSuccess: invalidate,
  });
  const resolve = useMutation({
    mutationFn: (published: boolean) =>
      api(`/posts/${post.id}/resolve`, { method: 'POST', body: body({ published }) }),
    onSuccess: invalidate,
  });
  const changeCaption = (messageId: number, value: string) => {
    setCaptions((current) =>
      current.map((c) => (c.messageId === messageId ? { ...c, html: value } : c)),
    );

    if (messageId === post.media[0]?.messageId) setHtml(value);

    setDirty(true);
  };
  const working = generate.isPending || save.isPending || publish.isPending || resolve.isPending;

  return (
    <>
      <header className="detail-header">
        <button className="icon-button mobile-back" aria-label={t('inbox')} onClick={back}>
          <ArrowLeft size={20} />
        </button>
        <span className="channel-avatar">{post.route.source.title.slice(0, 1)}</span>
        <div>
          <strong>{post.route.source.title}</strong>
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
            rate.error ??
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
            {post.media.map((media) => (
              <div key={media.id}>
                <MediaPreview postId={post.id} media={media} />
                <Html html={media.originalCaption} />
              </div>
            ))}
            {post.media.length === 0 && <Html html={post.originalHtml} />}
          </div>
        </div>
        {!['PUBLISHED', 'PUBLICATION_UNKNOWN'].includes(post.status) && (
          <div className="ai-controls">
            <OptionsForm value={options} onChange={setOptions} disabled={locked || working} />
            <button
              className="ai-button"
              disabled={locked || working}
              onClick={() => {
                if (!dirty || window.confirm(t('discard'))) generate.mutate();
              }}
            >
              <Sparkles size={17} />
              {t(revision ? 'regenerate' : 'generate')}
            </button>
          </div>
        )}
        <div className="draft-section">
          <Suspense fallback={<Loading />}>
            <div className="section-label">
              <h2>{t('draft')}</h2>
              {dirty && <span>{t('unsaved')}</span>}
            </div>
            {post.media.length ? (
              captions.map((caption, index) => (
                <div className="caption-editor" key={caption.messageId}>
                  <small>
                    {index + 1} / {captions.length}
                  </small>
                  <RichEditor
                    html={caption.html}
                    onChange={(value) => changeCaption(caption.messageId, value)}
                    disabled={locked || working}
                  />
                </div>
              ))
            ) : (
              <RichEditor
                html={html}
                onChange={(value) => {
                  setHtml(value);
                  setDirty(true);
                }}
                disabled={locked || working}
              />
            )}
            <div className="section-label">
              <h2>{t('preview')}</h2>
            </div>
            <div className="message preview-message">
              <strong className="preview-channel">{post.route.target.title}</strong>
              {post.media.length ? (
                post.media.map((media) => (
                  <div key={media.id}>
                    <MediaPreview postId={post.id} media={media} />
                    <Html
                      html={
                        captions.find((caption) => caption.messageId === media.messageId)?.html ??
                        ''
                      }
                    />
                  </div>
                ))
              ) : (
                <Html html={html} />
              )}
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
                {item.captions.slice(1).map((c) => (
                  <Html key={c.messageId} html={c.html} />
                ))}
              </div>
            ))}
          </details>
        )}
        {post.revisions.some((r) => r.origin === 'ai') && (
          <div className="rating">
            <span>{t('rate')}</span>
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                className={rating === post.rating ? 'chosen' : ''}
                key={rating}
                disabled={rate.isPending}
                aria-label={`${t('rate')}: ${rating}`}
                onClick={() => rate.mutate(rating)}
              >
                {rating}
              </button>
            ))}
          </div>
        )}
      </div>
      {!['PUBLISHED', 'PUBLICATION_UNKNOWN'].includes(post.status) && (
        <footer className="editor-actions">
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
            onClick={() => setConfirmation(true)}
          >
            <Send size={16} />
            {t('publish')}
          </button>
        </footer>
      )}
      {confirmation && (
        <ConfirmDialog onCancel={() => setConfirmation(false)}>
          <h2 id="confirm-title">{t('publishConfirm')}</h2>
          <p>{post.route.target.title}</p>
          <button
            autoFocus
            className="primary"
            disabled={publish.isPending}
            onClick={() => publish.mutate()}
          >
            {t('publish')}
          </button>
          <button className="secondary" onClick={() => setConfirmation(false)}>
            {t('cancel')}
          </button>
          <ErrorNotice error={publish.error} />
        </ConfirmDialog>
      )}
    </>
  );
}
