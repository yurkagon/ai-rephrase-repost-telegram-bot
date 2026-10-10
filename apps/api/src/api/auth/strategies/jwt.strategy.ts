import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { Environment } from '@/config/env.schema';
import { JWTAccessTokenPayload } from '@/api/auth/auth.interfaces';
import { UserService } from '@/api/user/user.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  public constructor(
    private readonly configService: ConfigService<Environment>,
    private readonly userService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow('JWT_SECRET', { infer: true }),
    });
  }

  public async validate(payload: JWTAccessTokenPayload) {
    if (payload.tokenType !== 'access' || typeof payload.userId !== 'string' || !payload.userId) {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.userService.findByIdForAuth(payload.userId);

    return user;
  }
}
