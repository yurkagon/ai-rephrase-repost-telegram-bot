import { useSyncExternalStore } from 'react';

import type { User } from './types';

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

export function establish(result: { accessToken: string; user: User }) {
  token = result.accessToken;
  user = result.user;
  ready = true;
  emit();
}

export async function restore() {
  if (!refreshRequest) {
    const started = epoch;

    refreshRequest = (async () => {
      try {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });

        if (!response.ok) throw new Error('No active session');

        const result = (await response.json()) as { accessToken: string; user: User };

        if (started === epoch) establish(result);
      } catch {
        if (started === epoch) {
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

export async function logout() {
  ++epoch;

  try {
    await api('/auth/logout', { method: 'POST' });
  } finally {
    token = null;
    user = null;
    ready = true;
    emit();
  }
}

async function response(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const headers = new Headers(init.headers);

  if (init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const result = await fetch(`/api${path}`, { ...init, headers, credentials: 'include' });

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
