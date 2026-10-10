import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { verify } from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { StringValue } from 'ms';

import type { Environment } from '@/config/env.schema';
import { UserService, toSafeUser, type User } from '@/api/user/user.service';
import { Role } from '@/infra/prisma/prisma.service';

import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './account.dto';
import type { JWTAccessTokenPayload } from './auth.interfaces';

export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');

export const newToken = () => randomBytes(32).toString('base64url');

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserService,
    private readonly config: ConfigService<Environment>,
    private readonly jwt: JwtService,
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

  private async issue(user: User) {
    // shortcut: Tokens cannot be revoked before expiry; add revocation if that becomes required.
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync({ userId: user.id, tokenType: 'access' } satisfies JWTAccessTokenPayload, {
        expiresIn: this.config.getOrThrow<StringValue>('JWT_EXPIRATION_TIME'),
      }),
      this.jwt.signAsync(
        { userId: user.id, tokenType: 'refresh' } satisfies JWTAccessTokenPayload,
        { expiresIn: this.config.getOrThrow<StringValue>('JWT_REFRESH_EXPIRATION_TIME') },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  async refresh(token: string) {
    let payload: JWTAccessTokenPayload;

    try {
      payload = await this.jwt.verifyAsync<JWTAccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.tokenType !== 'refresh' || typeof payload.userId !== 'string' || !payload.userId) {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.users.findByIdForAuth(payload.userId);

    return this.issue(user);
  }
}
