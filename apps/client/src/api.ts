import { useSyncExternalStore } from 'react';

import type { User } from './types';

const REFRESH_TOKEN_KEY = 'copywrite-refresh-token';

let token: string | null = null;
let user: User | null = null;
let ready = false;
let epoch = 0;
const listeners = new Set<() => void>();
let refreshRequest: Promise<void> | null = null;
let snapshot: { user: User | null; ready: boolean } = { user, ready };

function emit() {
  snapshot = { user, ready };

  for (const listener of listeners) listener();
}

export function useSession() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);

      return () => listeners.delete(fn);
    },
    () => snapshot,
  );
}

export function establish(result: { accessToken: string; refreshToken: string; user: User }) {
  ++epoch;
  sessionStorage.setItem(REFRESH_TOKEN_KEY, result.refreshToken);
  token = result.accessToken;
  user = result.user;
  ready = true;
  emit();
}

export async function restore() {
  if (!refreshRequest) {
    const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY);

    if (!refreshToken) {
      token = null;
      user = null;
      ready = true;
      emit();

      return;
    }

    const started = epoch;

    refreshRequest = (async () => {
      try {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body({ refreshToken }),
        });

        if (!response.ok) throw new Error('Invalid or expired refresh token');

        const tokens = (await response.json()) as { accessToken: string; refreshToken: string };
        const profile = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });

        if (!profile.ok) throw new Error('Account is unavailable');

        const user = (await profile.json()) as User;

        if (started === epoch) establish({ ...tokens, user });
      } catch {
        if (started === epoch) {
          sessionStorage.removeItem(REFRESH_TOKEN_KEY);
          token = null;
          user = null;
          ready = true;
          emit();
        }
      } finally {
        refreshRequest = null;
      }
    })();
  }

  return refreshRequest;
}

export function updateUser(value: User) {
  user = value;
  emit();
}

export function logout() {
  ++epoch;
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  token = null;
  user = null;
  ready = true;
  emit();

  return Promise.resolve();
}

async function response(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const headers = new Headers(init.headers);

  if (init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const result = await fetch(`/api${path}`, { ...init, headers });

  if (result.status === 401 && retry && !path.startsWith('/auth/')) {
    await restore();

    if (token) return response(path, init, false);
  }

  if (!result.ok) {
    const error = (await result.json().catch(() => ({ message: 'Connection failed' }))) as {
      message?: string | string[];
    };

    throw new Error(
      Array.isArray(error.message) ? error.message.join(', ') : (error.message ?? 'Request failed'),
    );
  }

  return result;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const result = await response(path, init);

  return result.status === 204 ? (undefined as T) : (result.json() as Promise<T>);
}

export async function mediaBlob(path: string, signal: AbortSignal) {
  return (await response(path, { signal })).blob();
}

export const body = (value: unknown) => JSON.stringify(value);
