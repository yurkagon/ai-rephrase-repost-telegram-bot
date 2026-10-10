import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'argon2';

import { UserService, toSafeUser } from '@/api/user/user.service';
import { Role } from '@/infra/prisma/prisma.service';

import { AuthService } from './auth.service';
import type { JWTAccessTokenPayload } from './auth.interfaces';
import { JwtStrategy } from './strategies/jwt.strategy';

describe('stateless JWT authentication', () => {
  const users = { findByEmail: jest.fn(), findByIdForAuth: jest.fn(), create: jest.fn() };
  const config = new ConfigService({
    JWT_SECRET: 'offline-test-secret',
    JWT_EXPIRATION_TIME: '15m',
    JWT_REFRESH_EXPIRATION_TIME: '7d',
  });
  const jwt = new JwtService({ secret: 'offline-test-secret' });
  const service = new AuthService(users as unknown as UserService, config, jwt);
  const strategy = new JwtStrategy(config, users as unknown as UserService);
  const user = {
    id: 'u1',
    email: 'ada@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    role: Role.USER,
    telegramId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    password: '',
  };

  beforeAll(async () => {
    user.password = await hash('correct-password');
  });

  beforeEach(() => {
    jest.resetAllMocks();
    users.findByEmail.mockResolvedValue(user);
    users.findByIdForAuth.mockResolvedValue(toSafeUser(user));
  });

  it('returns the account and signed token pair without a session claim', async () => {
    const result = await service.login({ email: 'Ada@EXAMPLE.com', password: 'correct-password' });
    const access = jwt.verify<JWTAccessTokenPayload & { iat: number; exp: number }>(
      result.accessToken,
    );
    const refresh = jwt.verify<JWTAccessTokenPayload & { iat: number; exp: number }>(
      result.refreshToken,
    );

    expect(result.user).not.toHaveProperty('password');
    expect(access).toMatchObject({ userId: user.id, tokenType: 'access' });
    expect(refresh).toMatchObject({ userId: user.id, tokenType: 'refresh' });
    expect(access).not.toHaveProperty('sessionId');
    expect(refresh).not.toHaveProperty('sessionId');
    expect(access.exp - access.iat).toBe(15 * 60);
    expect(refresh.exp - refresh.iat).toBe(7 * 86400);
    expect(users.findByEmail).toHaveBeenCalledWith(user.email);
  });

  it('rejects incorrect passwords and nonexistent accounts', async () => {
    await expect(service.login({ email: user.email, password: 'wrong' })).rejects.toThrow(
      'Invalid credentials',
    );
    users.findByEmail.mockResolvedValue(null);
    await expect(
      service.login({ email: user.email, password: 'correct-password' }),
    ).rejects.toThrow('Invalid credentials');
  });

  it('refreshes from a signed JWT without storing or consuming it', async () => {
    const token = jwt.sign({ userId: user.id, tokenType: 'refresh' }, { expiresIn: '7d' });

    for (let i = 0; i < 2; i++) {
      const result = await service.refresh(token);

      expect(jwt.verify(result.accessToken)).toMatchObject({
        userId: user.id,
        tokenType: 'access',
      });
      expect(jwt.verify(result.refreshToken)).toMatchObject({
        userId: user.id,
        tokenType: 'refresh',
      });
    }

    expect(users.findByIdForAuth).toHaveBeenCalledWith(user.id);
  });

  it.each([
    'invalid',
    new JwtService({ secret: 'other-secret' }).sign({ userId: 'u1', tokenType: 'refresh' }),
    jwt.sign({ userId: 'u1', tokenType: 'refresh' }, { expiresIn: -1 }),
  ])('rejects invalid, forged and expired refresh tokens', async (token) => {
    await expect(service.refresh(token)).rejects.toThrow('Invalid or expired refresh token');
    expect(users.findByIdForAuth).not.toHaveBeenCalled();
  });

  it.each([
    { userId: 'u1', tokenType: 'access' },
    { tokenType: 'refresh' },
    { userId: '', tokenType: 'refresh' },
  ])('rejects refresh JWTs with invalid claims', async (payload) => {
    await expect(service.refresh(jwt.sign(payload))).rejects.toThrow('Invalid token type');
    expect(users.findByIdForAuth).not.toHaveBeenCalled();
  });

  it('rejects refresh when the account no longer exists', async () => {
    users.findByIdForAuth.mockRejectedValue(new UnauthorizedException('User not found'));

    await expect(
      service.refresh(jwt.sign({ userId: user.id, tokenType: 'refresh' })),
    ).rejects.toThrow('User not found');
  });

  it('authenticates an access JWT against the account without a session', async () => {
    await expect(
      strategy.validate({ userId: user.id, tokenType: 'access' }),
    ).resolves.toMatchObject({ id: user.id });
    expect(users.findByIdForAuth).toHaveBeenCalledWith(user.id);
  });

  it('rejects refresh tokens and missing account IDs in the access guard', async () => {
    await expect(strategy.validate({ userId: user.id, tokenType: 'refresh' })).rejects.toThrow(
      'Invalid token type',
    );
    await expect(strategy.validate({ userId: '', tokenType: 'access' })).rejects.toThrow(
      'Invalid token type',
    );
    expect(users.findByIdForAuth).not.toHaveBeenCalled();
  });

  it('public registration forces USER and normalizes email', async () => {
    users.create.mockResolvedValue(user);

    await expect(
      service.register({
        email: 'Ada@EXAMPLE.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        password: '12345678',
        confirmPassword: '12345678',
      }),
    ).resolves.toEqual({ message: 'Account created' });
    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'USER', email: 'ada@example.com' }),
    );
  });
});
