import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '@/config/env.schema';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { JWTAccessTokenPayload } from '@/api/auth/auth.interfaces';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { UserService } from '@/api/user/user.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  public constructor(
    private readonly configService: ConfigService<Environment>,
    private readonly userService: UserService,
    private readonly db: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow('JWT_SECRET', { infer: true }),
    });
  }

  public async validate(payload: JWTAccessTokenPayload) {
    if (payload.tokenType !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    const session = await this.db.refreshSession.findUnique({
      where: { id: payload.sessionId ?? '' },
    });
    if (!session || session.userId !== payload.userId || session.expiresAt <= new Date())
      throw new UnauthorizedException('Session expired');
    const user = await this.userService.findByIdForAuth(payload.userId);

    return user;
  }
}
