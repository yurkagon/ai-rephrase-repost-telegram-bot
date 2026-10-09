import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'argon2';

import type { UserService } from '@/api/user/user.service';

import { AuthService } from './auth.service';
import type { JWTAccessTokenPayload } from './auth.interfaces';

describe('AuthService', () => {
  const jwt = new JwtService({ secret: 'test-secret' });
  const config = new ConfigService({
    JWT_EXPIRATION_TIME: '2h',
    JWT_REFRESH_EXPIRATION_TIME: '7d',
  });
  const findByEmail = jest.fn();
  const findByIdForAuth = jest.fn();
  const users = { findByEmail, findByIdForAuth } as unknown as UserService;
  const service = new AuthService(users, config, jwt);

  let passwordHash: string;
  const user = {
    id: 'user-1',
    email: 'ada@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    role: 'SUPERADMIN' as const,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeAll(async () => {
    passwordHash = await hash('correct-password');
  });

  beforeEach(() => {
    jest.resetAllMocks();
    findByEmail.mockResolvedValue({ ...user, password: passwordHash });
    findByIdForAuth.mockResolvedValue(user);
  });

  it('returns safe user data and distinct access and refresh tokens for valid credentials', async () => {
    const result = await service.login({ email: user.email, password: 'correct-password' });

    expect(result.user).toEqual(user);
    expect(result.user).not.toHaveProperty('password');
    expect(jwt.verify<JWTAccessTokenPayload>(result.accessToken).tokenType).toBe('access');
    expect(jwt.verify<JWTAccessTokenPayload>(result.refreshToken).tokenType).toBe('refresh');
  });

  it('rejects an invalid password', async () => {
    await expect(service.login({ email: user.email, password: 'wrong-password' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refreshes a token pair for an existing user', async () => {
    const { refreshToken } = await service.login({
      email: user.email,
      password: 'correct-password',
    });

    const result = await service.refresh(refreshToken);
    expect(findByIdForAuth).toHaveBeenCalledWith(user.id);
    expect(jwt.verify<JWTAccessTokenPayload>(result.accessToken).tokenType).toBe('access');
    expect(jwt.verify<JWTAccessTokenPayload>(result.refreshToken).tokenType).toBe('refresh');
  });

  it('rejects an access token used as a refresh token', async () => {
    const { accessToken } = await service.login({
      email: user.email,
      password: 'correct-password',
    });

    await expect(service.refresh(accessToken)).rejects.toThrow(UnauthorizedException);
    expect(findByIdForAuth).not.toHaveBeenCalled();
  });
});
