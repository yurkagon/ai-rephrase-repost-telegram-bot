import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

import type { User } from './types';

const user: User = {
  id: 'u1',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Editor',
  role: 'USER',
  telegramId: null,
};
const key = 'copywrite-refresh-token';
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.resetModules();
  sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

it('restores an account after reload from the tab refresh token', async () => {
  sessionStorage.setItem(key, 'refresh-old');
  fetchMock.mockResolvedValueOnce(
    Response.json({ accessToken: 'access-new', refreshToken: 'refresh-new' }),
  );
  fetchMock.mockResolvedValueOnce(Response.json(user));
  const auth = await import('./api');
  const { result } = renderHook(auth.useSession);

  await act(() => auth.restore());

  expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: 'refresh-old' }),
  });
  expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/auth/me', {
    headers: { Authorization: 'Bearer access-new' },
  });
  expect(sessionStorage.getItem(key)).toBe('refresh-new');
  expect(result.current).toEqual({ user, ready: true });
});

it('deduplicates simultaneous refreshes and retries a protected request once', async () => {
  const auth = await import('./api');

  // Starting without a token must not leave a completed refresh cached.
  await auth.restore();
  auth.establish({ user, accessToken: 'access-old', refreshToken: 'refresh-old' });
  fetchMock.mockResolvedValueOnce(Response.json({ message: 'Expired' }, { status: 401 }));
  fetchMock.mockResolvedValueOnce(
    Response.json({ accessToken: 'access-new', refreshToken: 'refresh-new' }),
  );
  fetchMock.mockResolvedValueOnce(Response.json(user));
  fetchMock.mockResolvedValueOnce(Response.json({ ok: true }));

  await expect(auth.api('/channels')).resolves.toEqual({ ok: true });
  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(new Headers(fetchMock.mock.calls[3][1]?.headers).get('Authorization')).toBe(
    'Bearer access-new',
  );

  fetchMock.mockClear();
  fetchMock.mockResolvedValueOnce(
    Response.json({ accessToken: 'access-3', refreshToken: 'refresh-3' }),
  );
  fetchMock.mockResolvedValueOnce(Response.json(user));
  await Promise.all([auth.restore(), auth.restore()]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('clears authentication on an expired refresh token', async () => {
  const auth = await import('./api');
  const { result } = renderHook(auth.useSession);

  act(() => auth.establish({ user, accessToken: 'access', refreshToken: 'expired' }));
  fetchMock.mockResolvedValueOnce(Response.json({ message: 'Expired' }, { status: 401 }));
  await act(() => auth.restore());

  expect(sessionStorage.getItem(key)).toBeNull();
  expect(result.current).toEqual({ user: null, ready: true });
});

it('logs out locally and does not restore credentials from an in-flight refresh', async () => {
  const auth = await import('./api');
  const { result } = renderHook(auth.useSession);
  let complete!: (response: Response) => void;

  act(() => auth.establish({ user, accessToken: 'access', refreshToken: 'refresh' }));
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  fetchMock.mockResolvedValueOnce(Response.json(user));
  const restoring = auth.restore();

  await act(() => auth.logout());
  complete(Response.json({ accessToken: 'late-access', refreshToken: 'late-refresh' }));
  await act(() => restoring);

  expect(sessionStorage.getItem(key)).toBeNull();
  expect(result.current).toEqual({ user: null, ready: true });
  expect(fetchMock.mock.calls.some(([url]) => url === '/api/auth/logout')).toBe(false);
});

it('does not overwrite a new login with an older refresh response', async () => {
  const auth = await import('./api');
  const { result } = renderHook(auth.useSession);
  let complete!: (response: Response) => void;
  const newUser = { ...user, id: 'u2' };

  act(() => auth.establish({ user, accessToken: 'old', refreshToken: 'old-refresh' }));
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  fetchMock.mockResolvedValueOnce(Response.json(user));
  const restoring = auth.restore();

  act(() => auth.establish({ user: newUser, accessToken: 'new', refreshToken: 'new-refresh' }));
  complete(Response.json({ accessToken: 'late-access', refreshToken: 'late-refresh' }));
  await act(() => restoring);

  expect(sessionStorage.getItem(key)).toBe('new-refresh');
  expect(result.current.user).toEqual(newUser);
});
