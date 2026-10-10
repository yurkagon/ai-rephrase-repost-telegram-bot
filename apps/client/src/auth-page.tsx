import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

import { api, body, establish } from './api';
import type { User } from './types';
import { Brand, ErrorNotice, LanguageSwitch } from './components';

export function AuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const cache = useQueryClient();
  const mode = location.pathname.slice(1) || 'login';
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    setPending(true);

    const fields = Object.fromEntries(new FormData(event.currentTarget));

    try {
      if (mode === 'login') {
        const result = await api<{ user: User; accessToken: string; refreshToken: string }>(
          '/auth/login',
          {
            method: 'POST',
            body: body(fields),
          },
        );

        cache.clear();
        establish(result);
        navigate('/workspace');
      } else {
        await api(`/auth/${mode}`, {
          method: 'POST',
          body: body(fields),
        });
        setSuccess(true);
      }
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="auth-page">
      <header>
        <Brand />
        <LanguageSwitch />
      </header>
      <main className="auth-main">
        <section className="auth-story">
          <div className="auth-channel">
            <span className="channel-avatar">TD</span>
            <div>
              <strong>{t('product')}</strong>
              <small>{t('subtitle')}</small>
            </div>
          </div>
          <h1>{t('welcome')}</h1>
          <p>{t('authHint')}</p>
          <div className="story-message">
            <p>{t('original')}</p>
            <strong>Good stories deserve a wider audience.</strong>
            <span className="story-divider">
              <ArrowRight size={20} />
            </span>
            <p>{t('draft')}</p>
            <strong>Хороші історії заслуговують на ширшу аудиторію.</strong>
            <small>AI · {t('rewrite')}</small>
          </div>
        </section>
        <section className="auth-form">
          <h2>{t(mode)}</h2>
          <p>{t('privacyHint')}</p>
          <ErrorNotice error={error} />
          {success ? (
            <div className="success-state" role="status">
              <CheckCircle2 size={28} />
              <p>{t('accountCreated')}</p>
              <Link to="/login">{t('backLogin')}</Link>
            </div>
          ) : (
            <form onSubmit={(e) => void submit(e)}>
              {mode === 'register' && (
                <div className="form-row">
                  <label>
                    {t('firstName')}
                    <input
                      name="firstName"
                      required
                      minLength={2}
                      maxLength={20}
                      autoComplete="given-name"
                    />
                  </label>
                  <label>
                    {t('lastName')}
                    <input
                      name="lastName"
                      required
                      minLength={2}
                      maxLength={20}
                      autoComplete="family-name"
                    />
                  </label>
                </div>
              )}
              <label>
                {t('email')}
                <input name="email" type="email" required autoComplete="email" />
              </label>
              <label>
                {t('password')}
                <input
                  name="password"
                  type="password"
                  required
                  minLength={mode === 'login' ? 1 : 8}
                  maxLength={128}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </label>
              {mode === 'register' && (
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
              )}
              <button className="primary" disabled={pending}>
                {pending ? t('busy') : t(mode)}
                <ArrowRight size={16} />
              </button>
            </form>
          )}
          <div className="auth-links">
            {mode === 'login' ? (
              <Link to="/register">{t('register')}</Link>
            ) : (
              <Link to="/login">{t('backLogin')}</Link>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
