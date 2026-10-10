import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';

import type { Environment } from '@/config/env.schema';
import { UserModule } from '@/api/user/user.module';
import { RateLimitGuard } from '@/common/guards/rate-limit.guard';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UserModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Environment>) => ({
        secret: configService.getOrThrow('JWT_SECRET', { infer: true }),
        signOptions: { algorithm: 'HS256' },
        ignoreExpiration: false,
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RateLimitGuard],
})
export class AuthModule {}
