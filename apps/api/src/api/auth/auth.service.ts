import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { verify } from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import ms, { type StringValue } from 'ms';

import type { Environment } from '@/config/env.schema';
import { UserService, toSafeUser, type User } from '@/api/user/user.service';
import { PrismaService, Role } from '@/infra/prisma/prisma.service';

import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './account.dto';

export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');

export const newToken = () => randomBytes(32).toString('base64url');

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserService,
    private readonly config: ConfigService<Environment>,
    private readonly jwt: JwtService,
    private readonly db: PrismaService,
  ) {}

  async register(dto: RegisterDto) {
    await this.users.create({
      ...dto,
      email: dto.email.trim().toLowerCase(),
      role: Role.USER,
    });

    return { message: 'Account created' };
  }

  async login(dto: LoginDto) {
    const user = await this.users.findByEmail(dto.email.trim().toLowerCase());

    if (!user || !(await verify(user.password, dto.password)))
      throw new UnauthorizedException('Invalid credentials');

    return { user: toSafeUser(user), ...(await this.issue(user)) };
  }

  private async issue(user: User, sessionId?: string) {
    const refreshToken = newToken();
    const expiresAt = new Date(
      Date.now() + ms(this.config.getOrThrow<StringValue>('JWT_REFRESH_EXPIRATION_TIME')),
    );
    const session = await this.db.refreshSession.create({
      data: {
        ...(sessionId ? { id: sessionId } : {}),
        userId: user.id,
        tokenHash: tokenHash(refreshToken),
        expiresAt,
      },
    });
    const accessToken = await this.jwt.signAsync(
      { userId: user.id, tokenType: 'access', sessionId: session.id },
      { expiresIn: this.config.getOrThrow<StringValue>('JWT_EXPIRATION_TIME') },
    );

    return { accessToken, refreshToken };
  }

  async refresh(token: string) {
    const refreshToken = newToken();
    const session = await this.db.$transaction(async (tx) => {
      const old = await tx.refreshSession.findUnique({
        where: { tokenHash: tokenHash(token) },
        include: { user: true },
      });

      if (!old || old.expiresAt <= new Date())
        throw new UnauthorizedException('Invalid or expired session');

      const rotated = await tx.refreshSession.updateMany({
        where: { id: old.id, tokenHash: old.tokenHash },
        data: { tokenHash: tokenHash(refreshToken) },
      });

      if (rotated.count !== 1) throw new UnauthorizedException('Session already rotated');

      return old;
    });
    const accessToken = await this.jwt.signAsync(
      { userId: session.userId, tokenType: 'access', sessionId: session.id },
      { expiresIn: this.config.getOrThrow<StringValue>('JWT_EXPIRATION_TIME') },
    );

    return { user: toSafeUser(session.user), accessToken, refreshToken };
  }

  async logout(token: string) {
    await this.db.refreshSession.deleteMany({ where: { tokenHash: tokenHash(token) } });
  }
}
