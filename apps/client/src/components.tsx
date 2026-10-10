import { useEffect, lazy, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import DOMPurify from 'dompurify';
import { LoaderCircle, Send } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { mediaBlob } from './api';
import type { Media, Options } from './types';

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
  return error ? (
    <div className="error-notice" role="alert">
      {error instanceof Error ? error.message : String(error)}
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
}: {
  value: Options;
  onChange: (v: Options) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <fieldset className="options-grid" disabled={disabled}>
      {(['mode', 'language', 'tone', 'length'] as const).map((key) => {
        const choices =
          key === 'mode'
            ? ['translate', 'edit']
            : key === 'language'
              ? ['uk', 'en']
              : key === 'tone'
                ? ['neutral', 'formal', 'friendly']
                : ['preserve', 'concise'];

        return (
          <label key={key}>
            {t(key === 'language' ? 'outputLanguage' : key)}
            <select
              aria-label={t(key === 'language' ? 'outputLanguage' : key)}
              value={value[key]}
              disabled={value.mode === 'translate' && (key === 'tone' || key === 'length')}
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
      <label className="check-field">
        <input
          type="checkbox"
          checked={value.removeSource}
          onChange={(e) => onChange({ ...value, removeSource: e.target.checked })}
        />
        {t('removeSource')}
      </label>
    </fieldset>
  );
}

export const RichEditor = lazy(() =>
  import('./rich-editor').then((module) => ({ default: module.RichEditor })),
);

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
