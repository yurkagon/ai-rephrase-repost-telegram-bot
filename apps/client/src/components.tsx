import { useEffect, lazy, useRef, useId } from 'react';
import { useTranslation } from 'react-i18next';
import DOMPurify from 'dompurify';
import { LoaderCircle, Send } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { mediaBlob } from './api';
import type { Channel, Media, Options } from './types';

export function LanguageSwitch() {
  const { i18n, t } = useTranslation();

  return (
    <select
      aria-label={t('uiLanguage')}
      className="language-switch"
      value={i18n.language}
      onChange={(e) => void i18n.changeLanguage(e.target.value)}
    >
      <option value="uk">UA</option>
      <option value="en">EN</option>
    </select>
  );
}

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Send size={21} />
      </span>
      <span>
        Copywrite<small>Telegram workspace</small>
      </span>
    </div>
  );
}

export function ErrorNotice({ error }: { error: unknown }) {
  const { t } = useTranslation();
  const message = error instanceof Error ? error.message : String(error);

  return error ? (
    <div className="error-notice" role="alert">
      {t(message, { defaultValue: message })}
    </div>
  ) : null;
}

export function Loading() {
  const { t } = useTranslation();

  return (
    <div className="loading" role="status">
      <LoaderCircle size={20} className="spin" />
      {t('loading')}
    </div>
  );
}

export function Html({ html }: { html: string }) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'b',
      'strong',
      'i',
      'em',
      'u',
      'ins',
      's',
      'strike',
      'del',
      'a',
      'code',
      'pre',
      'blockquote',
      'span',
      'tg-spoiler',
      'tg-emoji',
    ],
    ALLOWED_ATTR: ['href', 'class', 'expandable', 'emoji-id'],
    ADD_TAGS: ['tg-spoiler', 'tg-emoji'],
  });

  return <div className="telegram-text" dangerouslySetInnerHTML={{ __html: clean }} />;
}

export function OptionsForm({
  value,
  onChange,
  disabled = false,
  showCustomInstructions = false,
}: {
  value: Options;
  onChange: (v: Options) => void;
  disabled?: boolean;
  showCustomInstructions?: boolean;
}) {
  const { t } = useTranslation();
  const instructionsId = useId();

  return (
    <fieldset className="options-grid" disabled={disabled}>
      {(['language', 'tone', 'length', 'rewriteStrength'] as const).map((key) => {
        const choices =
          key === 'language'
            ? ['uk', 'en']
            : key === 'tone'
              ? ['neutral', 'formal', 'friendly']
              : key === 'length'
                ? ['preserve', 'concise']
                : ['light', 'balanced', 'deep'];

        return (
          <label key={key}>
            {t(key === 'language' ? 'outputLanguage' : key)}
            <select
              aria-label={t(key === 'language' ? 'outputLanguage' : key)}
              value={value[key] ?? 'balanced'}
              aria-describedby={
                key === 'rewriteStrength' ? `${instructionsId}-strength-hint` : undefined
              }
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            >
              {choices.map((choice) => (
                <option key={choice} value={choice}>
                  {t(choice)}
                </option>
              ))}
            </select>
          </label>
        );
      })}
      <p className="hint rewrite-strength-hint" id={`${instructionsId}-strength-hint`}>
        {t(`rewriteStrengthHint_${value.rewriteStrength ?? 'balanced'}`)}
      </p>
      <label className="check-field">
        <input
          type="checkbox"
          checked={value.removeSource}
          onChange={(e) => onChange({ ...value, removeSource: e.target.checked })}
        />
        {t('removeSource')}
      </label>
      {showCustomInstructions && (
        <div className="custom-instructions">
          <label htmlFor={instructionsId}>{t('customInstructions')}</label>
          <textarea
            id={instructionsId}
            aria-describedby={`${instructionsId}-hint`}
            rows={4}
            maxLength={2000}
            value={value.customInstructions ?? ''}
            placeholder={t('customInstructionsPlaceholder')}
            onChange={(event) => onChange({ ...value, customInstructions: event.target.value })}
          />
          <p className="hint" id={`${instructionsId}-hint`}>
            {t('customInstructionsHint')}
          </p>
        </div>
      )}
    </fieldset>
  );
}

export const RichEditor = lazy(() =>
  import('./rich-editor').then((module) => ({ default: module.RichEditor })),
);

export function ChannelAvatar({ channel }: { channel: Channel }) {
  const image = useRef<HTMLImageElement>(null);
  const result = useQuery({
    queryKey: ['channel-avatar', channel.id],
    queryFn: ({ signal }) => mediaBlob(`/channels/${channel.id}/avatar`, signal),
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (!result.data || !image.current) return;

    const url = URL.createObjectURL(result.data);

    image.current.src = url;

    return () => URL.revokeObjectURL(url);
  }, [result.data]);

  return (
    <span className="channel-avatar" aria-hidden="true">
      {channel.title.slice(0, 1)}
      {result.data && (
        <img
          ref={image}
          alt=""
          onLoad={(event) => {
            event.currentTarget.hidden = false;
          }}
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      )}
    </span>
  );
}

export function MediaPreview({ postId, media }: { postId: string; media: Media }) {
  const { t } = useTranslation();
  const element = useRef<HTMLImageElement | HTMLVideoElement>(null);
  const result = useQuery({
    queryKey: ['media', postId, media.id],
    queryFn: ({ signal }) => mediaBlob(`/posts/${postId}/media/${media.id}`, signal),
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    if (!result.data || !element.current) return;

    const objectUrl = URL.createObjectURL(result.data);

    element.current.src = objectUrl;

    return () => URL.revokeObjectURL(objectUrl);
  }, [result.data]);

  if (result.error) return <p className="media-fallback">{t('mediaUnavailable')}</p>;
  if (!result.data) return <Loading />;

  return media.type === 'photo' ? (
    <img
      ref={(node) => {
        element.current = node;
      }}
      className="post-media"
      alt=""
    />
  ) : (
    <video
      ref={(node) => {
        element.current = node;
      }}
      className="post-media"
      controls
      playsInline
      preload="metadata"
    />
  );
}

export function ConfirmDialog({
  children,
  onCancel,
}: {
  children: React.ReactNode;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="confirm-dialog"
      aria-labelledby="confirm-title"
      onCancel={onCancel}
    >
      {children}
    </dialog>
  );
}
