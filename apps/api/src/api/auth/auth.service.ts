import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { verify } from 'argon2';
import type { StringValue } from 'ms';

import { UserService, toSafeUser, type User } from '@/api/user/user.service';

import { LoginDto } from './dto/login.dto';

import { JWTAccessTokenPayload } from './auth.interfaces';

@Injectable()
export class AuthService {
  private readonly JWT_EXPIRATION_TIME: StringValue;
  private readonly JWT_REFRESH_EXPIRATION_TIME: StringValue;

  constructor(
    private readonly userService: UserService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.JWT_EXPIRATION_TIME = this.configService.getOrThrow<StringValue>('JWT_EXPIRATION_TIME');
    this.JWT_REFRESH_EXPIRATION_TIME = this.configService.getOrThrow<StringValue>(
      'JWT_REFRESH_EXPIRATION_TIME',
    );
  }

  public async login(loginDto: LoginDto) {
    const user = await this.userService.findByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await verify(user.password, loginDto.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(user);

    return { user: toSafeUser(user), ...tokens };
  }

  public async refresh(refreshToken: string) {
    let payload: JWTAccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<JWTAccessTokenPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.userService.findByIdForAuth(payload.userId);

    return this.generateTokens(user);
  }

  private async generateTokens(user: User) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { userId: user.id, tokenType: 'access' } satisfies JWTAccessTokenPayload,
        {
          expiresIn: this.JWT_EXPIRATION_TIME,
        },
      ),
      this.jwtService.signAsync(
        { userId: user.id, tokenType: 'refresh' } satisfies JWTAccessTokenPayload,
        {
          expiresIn: this.JWT_REFRESH_EXPIRATION_TIME,
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }
}
