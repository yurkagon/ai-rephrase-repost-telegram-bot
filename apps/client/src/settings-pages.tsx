import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CheckCircle2, ExternalLink, Plus, Radio, Trash2 } from 'lucide-react';

import { api, body, updateUser, logout, useSession } from './api';
import { defaults, type Channel, type Metrics, type Options, type Route, type User } from './types';
import { ChannelAvatar, ErrorNotice, Loading, OptionsForm, LanguageSwitch } from './components';

export function ChannelsPage() {
  const { t } = useTranslation();
  const { user } = useSession();
  const cache = useQueryClient();
  const channels = useQuery({ queryKey: ['channels'], queryFn: () => api<Channel[]>('/channels') });
  const [url, setUrl] = useState('');
  const connect = useMutation({
    mutationFn: () => api<{ url: string }>('/channels/connect', { method: 'POST' }),
    onSuccess: (result) => setUrl(result.url),
  });
  const add = useMutation({
    mutationFn: (identifier: string) =>
      api('/channels', { method: 'POST', body: body({ identifier }) }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ['channels'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/channels/${id}`, { method: 'DELETE' }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ['channels'] }),
  });
  const refresh = useMutation({
    mutationFn: async () => {
      const result = await api<User>('/auth/me');

      updateUser(result);

      return result;
    },
  });

  return (
    <section className="settings-page">
      <header className="page-heading">
        <div>
          <h1>{t('channels')}</h1>
          <p>{t('connectHint')}</p>
        </div>
        <Radio size={26} />
      </header>
      <div className="connection-panel">
        <CheckCircle2 size={23} />
        <div>
          <strong>{user?.telegramId ? t('connected') : t('connect')}</strong>
          <p>{user?.telegramId ? `Telegram ID: ${user.telegramId}` : t('connectHint')}</p>
        </div>
        <div className="connection-actions">
          {!user?.telegramId && (
            <button
              className="primary"
              disabled={connect.isPending}
              onClick={() => connect.mutate()}
            >
              {t('connect')}
            </button>
          )}
          {url && (
            <a className="button primary" href={url} target="_blank" rel="noreferrer">
              {t('openBot')}
              <ExternalLink size={15} />
            </a>
          )}
          <button
            className="secondary"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            {t('refresh')}
          </button>
        </div>
      </div>
      <ErrorNotice
        error={connect.error ?? refresh.error ?? add.error ?? remove.error ?? channels.error}
      />
      <form
        className="add-channel"
        onSubmit={(e) => {
          e.preventDefault();

          const form = e.currentTarget;

          add.mutate(String(new FormData(form).get('identifier')), {
            onSuccess: () => form.reset(),
          });
        }}
      >
        <label>
          {t('identifier')}
          <input
            name="identifier"
            aria-describedby="channel-identifier-hint channel-bot-hint"
            placeholder="@channel_name / 1001234567890"
            required
            disabled={!user?.telegramId}
          />
        </label>
        <button className="primary" disabled={!user?.telegramId || add.isPending}>
          <Plus size={17} />
          {t('addChannel')}
        </button>
      </form>
      <p className="hint channel-identifier-hint" id="channel-identifier-hint">
        {t('channelHint')}
      </p>
      <p className="hint" id="channel-bot-hint">
        {t('channelBotHint')}
      </p>
      <details className="channel-id-help">
        <summary>{t('channelIdHelp')}</summary>
        <ol>
          <li>{t('channelIdCopyPost')}</li>
          <li>
            {t('channelIdFindNumber')}
            <p className="channel-id-example">
              <code>https://t.me/c/1234567890/42</code>
            </p>
          </li>
          <li>
            {t('channelIdCalculate')}
            <p className="channel-id-example">
              {t('channelIdExample')} <code>1001234567890</code>
            </p>
          </li>
        </ol>
        <p>{t('channelInviteHint')}</p>
      </details>
      {channels.isLoading ? (
        <Loading />
      ) : channels.isError ? (
        <button className="secondary" onClick={() => void channels.refetch()}>
          {t('retry')}
        </button>
      ) : channels.data?.length === 0 ? (
        <div className="empty">
          <Radio size={36} />
          <h2>{t('noChannels')}</h2>
        </div>
      ) : (
        <div className="channel-list">
          {channels.data?.map((channel) => (
            <div className="channel-row" key={channel.id}>
              <ChannelAvatar channel={channel} />
              <div>
                <strong>{channel.title}</strong>
                <small>
                  {channel.username ? `@${channel.username}` : channel.chatId.replace(/^-/, '')} ·{' '}
                  {channel.canPublish ? t('target') : t('source')}
                </small>
              </div>
              <button
                className="icon-button"
                aria-label={`${t('remove')} ${channel.title}`}
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(`${t('remove')} ${channel.title}?`)) remove.mutate(channel.id);
                }}
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>
      )}
      <Link className="button secondary" to="/routes">
        {t('createRoute')}
      </Link>
    </section>
  );
}

export function RoutesPage() {
  const { t } = useTranslation();
  const cache = useQueryClient();
  const [options, setOptions] = useState<Options>(defaults);
  const channels = useQuery({ queryKey: ['channels'], queryFn: () => api<Channel[]>('/channels') });
  const routes = useQuery({
    queryKey: ['routes'],
    queryFn: () => api<Route[]>('/channels/routes'),
  });
  const create = useMutation({
    mutationFn: (fields: Record<string, FormDataEntryValue>) =>
      api('/channels/routes', { method: 'POST', body: body({ ...fields, options }) }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ['routes'] }),
  });
  const update = useMutation({
    mutationFn: ({ id, ...fields }: { id: string; active?: boolean; options?: Options }) =>
      api(`/channels/routes/${id}`, { method: 'PATCH', body: body(fields) }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ['routes'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/channels/routes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['routes'] });
      void cache.invalidateQueries({ queryKey: ['posts'] });
    },
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [editOptions, setEditOptions] = useState<Options>(defaults);

  return (
    <section className="settings-page">
      <header className="page-heading">
        <div>
          <h1>{t('routes')}</h1>
          <p>{t('noRoutesHint')}</p>
        </div>
      </header>
      <ErrorNotice
        error={create.error ?? update.error ?? remove.error ?? routes.error ?? channels.error}
      />
      <form
        className="route-form"
        onSubmit={(e) => {
          e.preventDefault();

          const form = e.currentTarget;

          create.mutate(Object.fromEntries(new FormData(form)), { onSuccess: () => form.reset() });
        }}
      >
        <label>
          {t('routeName')}
          <input name="name" required maxLength={100} />
        </label>
        <div className="form-row">
          {(['sourceId', 'targetId'] as const).map((key) => (
            <label key={key}>
              {t(key === 'sourceId' ? 'source' : 'target')}
              <select name={key} aria-label={t(key === 'sourceId' ? 'source' : 'target')} required>
                <option value="">{t('choose')}</option>
                {channels.data
                  ?.filter((c) => key === 'sourceId' || c.canPublish)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
              </select>
            </label>
          ))}
        </div>
        <OptionsForm value={options} onChange={setOptions} />
        <button className="primary" disabled={create.isPending || (channels.data?.length ?? 0) < 2}>
          <Plus size={17} />
          {t('createRoute')}
        </button>
      </form>
      <div className="route-list">
        {routes.data?.map((route) => (
          <article className="route-row" key={route.id}>
            <header>
              <div>
                <strong>{route.name}</strong>
                <p>
                  {route.source.title} → {route.target.title}
                </p>
                <small>
                  {t(route.options.mode)} · {t(route.options.language)} ·{' '}
                  {t(route.active ? 'active' : 'paused')}
                </small>
              </div>
              <div className="row-actions">
                <button
                  className="secondary"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ id: route.id, active: !route.active })}
                >
                  {t(route.active ? 'pause' : 'resume')}
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    setEditing(route.id);
                    setEditOptions(route.options);
                  }}
                >
                  {t('edit')}
                </button>
                <button
                  className="icon-button"
                  aria-label={`${t('remove')} ${route.name}`}
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`${t('remove')} ${route.name}? ${t('removeRouteHint')}`))
                      remove.mutate(route.id);
                  }}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </header>
            {editing === route.id && (
              <div className="route-options">
                <OptionsForm value={editOptions} onChange={setEditOptions} />
                <button
                  className="primary"
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate(
                      { id: route.id, options: editOptions },
                      { onSuccess: () => setEditing(null) },
                    )
                  }
                >
                  {t('save')}
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export function MetricsPage() {
  const { t } = useTranslation();
  const result = useQuery({ queryKey: ['metrics'], queryFn: () => api<Metrics>('/posts/metrics') });

  if (result.isLoading) return <Loading />;

  return (
    <section className="settings-page">
      <header className="page-heading">
        <div>
          <h1>{t('metrics')}</h1>
          <p>{t('metricsHint')}</p>
        </div>
      </header>
      <ErrorNotice error={result.error} />
      {result.data && (
        <dl className="metrics-table">
          {(
            [
              'calls',
              'failures',
              'inputTokens',
              'outputTokens',
              'averageDurationMs',
              'averageRating',
            ] as const
          ).map((key) => (
            <div key={key}>
              <dt>{t(key)}</dt>
              <dd>
                {result.data![key] == null
                  ? t('noData')
                  : key === 'averageDurationMs'
                    ? `${(result.data![key]! / 1000).toFixed(1)} s`
                    : key === 'averageRating'
                      ? result.data![key]!.toFixed(1)
                      : result.data![key]!.toLocaleString()}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

export function AccountPage() {
  const { t } = useTranslation();
  const { user } = useSession();
  const cache = useQueryClient();
  const profile = useMutation({
    mutationFn: async (fields: Record<string, FormDataEntryValue>) => {
      const user = await api<User>('/user/me', { method: 'PATCH', body: body(fields) });

      updateUser(user);
    },
  });
  const password = useMutation({
    mutationFn: (fields: Record<string, FormDataEntryValue>) =>
      api('/user/me/password', { method: 'PATCH', body: body(fields) }),
    onSuccess: async () => {
      await logout();
      cache.clear();
    },
  });

  return (
    <section className="settings-page narrow">
      <header className="page-heading">
        <div>
          <h1>{t('account')}</h1>
          <p>{user?.email}</p>
        </div>
        <LanguageSwitch />
      </header>
      <ErrorNotice error={profile.error ?? password.error} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          profile.mutate(Object.fromEntries(new FormData(e.currentTarget)));
        }}
      >
        <div className="form-row">
          <label>
            {t('firstName')}
            <input
              name="firstName"
              defaultValue={user?.firstName}
              required
              minLength={2}
              maxLength={20}
            />
          </label>
          <label>
            {t('lastName')}
            <input
              name="lastName"
              defaultValue={user?.lastName}
              required
              minLength={2}
              maxLength={20}
            />
          </label>
        </div>
        <button className="primary" disabled={profile.isPending}>
          {t('profileSave')}
        </button>
        {profile.isSuccess && <p role="status">{t('saved')}</p>}
      </form>
      <form
        className="password-form"
        onSubmit={(e) => {
          e.preventDefault();
          password.mutate(Object.fromEntries(new FormData(e.currentTarget)));
        }}
      >
        <h2>{t('changePassword')}</h2>
        <label>
          {t('currentPassword')}
          <input name="currentPassword" type="password" required autoComplete="current-password" />
        </label>
        <label>
          {t('newPassword')}
          <input
            name="newPassword"
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
          />
        </label>
        <label>
          {t('confirmPassword')}
          <input
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
          />
        </label>
        <button className="secondary" disabled={password.isPending}>
          {t('changePassword')}
        </button>
      </form>
      <button className="secondary" onClick={() => void logout().finally(() => cache.clear())}>
        {t('logout')}
      </button>
    </section>
  );
}
