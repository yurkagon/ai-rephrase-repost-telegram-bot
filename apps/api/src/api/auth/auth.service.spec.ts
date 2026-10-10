import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'argon2';
import { AuthService, tokenHash } from './auth.service';
import { UserService } from '@/api/user/user.service';
import { PrismaService } from '@/infra/prisma/prisma.service';
describe('account sessions', () => {
  const db = {
    refreshSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const users = { findByEmail: jest.fn(), create: jest.fn() };
  const jwt = new JwtService({ secret: 'offline-test-secret' });
  const service = new AuthService(
    users as unknown as UserService,
    new ConfigService({ JWT_EXPIRATION_TIME: '15m', JWT_REFRESH_EXPIRATION_TIME: '7d' }),
    jwt,
    db as unknown as PrismaService,
  );
  const user = {
    id: 'u1',
    email: 'ada@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    role: 'USER',
    telegramId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    password: '',
  };
  beforeAll(async () => {
    user.password = await hash('correct-password');
  });
  beforeEach(() => {
    jest.clearAllMocks();
    users.findByEmail.mockResolvedValue(user);
    db.refreshSession.create.mockResolvedValue({ id: 'session1' });
    db.$transaction.mockImplementation((callback: (tx: typeof db) => Promise<unknown>) =>
      callback(db),
    );
  });
  it('returns a safe user, a session-bound access token and opaque refresh token', async () => {
    const result = await service.login({ email: user.email, password: 'correct-password' });
    expect(result.user).not.toHaveProperty('password');
    expect(jwt.verify(result.accessToken)).toMatchObject({
      tokenType: 'access',
      sessionId: 'session1',
    });
    expect(result.refreshToken).toHaveLength(43);
    expect(db.refreshSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tokenHash: tokenHash(result.refreshToken) }) as unknown,
    });
  });
  it('rejects bad credentials', async () => {
    await expect(service.login({ email: user.email, password: 'wrong' })).rejects.toThrow(
      'Invalid credentials',
    );
  });
  it('rotates a refresh token with an atomic compare and swap', async () => {
    db.refreshSession.findUnique.mockResolvedValue({
      id: 's1',
      tokenHash: tokenHash('old'),
      userId: user.id,
      user,
      expiresAt: new Date(Date.now() + 10000),
    });
    db.refreshSession.updateMany.mockResolvedValue({ count: 1 });
    const result = await service.refresh('old');
    expect(result.refreshToken).not.toBe('old');
    expect(db.refreshSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 's1', tokenHash: tokenHash('old') } }),
    );
    db.refreshSession.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.refresh('old')).rejects.toThrow('already rotated');
  });
  it('rejects nonexistent/expired refresh sessions and revokes on logout', async () => {
    db.refreshSession.findUnique.mockResolvedValue(null);
    await expect(service.refresh('invalid')).rejects.toThrow('Invalid or expired');
    await service.logout('secret');
    expect(db.refreshSession.deleteMany).toHaveBeenCalledWith({
      where: { tokenHash: tokenHash('secret') },
    });
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
