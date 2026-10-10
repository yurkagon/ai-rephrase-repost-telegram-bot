import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import ms, { type StringValue } from 'ms';
import type { Request, Response } from 'express';
import { Authorization } from '@/common/decorators/authorization.decorator';
import type { Environment } from '@/config/env.schema';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './account.dto';
import { PublicAuthGuard } from './public-auth.guard';
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Environment>,
  ) {}
  @Post('register')
  @UseGuards(PublicAuthGuard)
  @ApiOperation({ summary: 'Register a USER; sign in immediately without email verification' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }
  @Post('login')
  @UseGuards(PublicAuthGuard)
  @ApiOperation({ summary: 'Login; refresh session is stored in an HttpOnly cookie' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    return this.tokens(response, await this.auth.login(dto));
  }
  @Post('refresh')
  @UseGuards(PublicAuthGuard)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.tokens(response, await this.auth.refresh(this.cookie(request)));
  }
  @Post('logout')
  @UseGuards(PublicAuthGuard)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(this.cookie(request));
    response.clearCookie('refresh', { path: '/api/auth', sameSite: 'lax', secure: this.secure });
    return { message: 'Signed out' };
  }
  @Get('me')
  @Authorization()
  me(@Req() request: Request) {
    return request.user;
  }
  private get secure() {
    return this.config.get('NODE_ENV', { infer: true }) === 'production';
  }
  private cookie(request: Request): string {
    const cookies: Record<string, unknown> = request.cookies ?? {};
    return typeof cookies.refresh === 'string' ? cookies.refresh : '';
  }
  private tokens(
    response: Response,
    result: { accessToken: string; refreshToken: string; user: unknown },
  ) {
    response.cookie('refresh', result.refreshToken, {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: ms(this.config.getOrThrow<StringValue>('JWT_REFRESH_EXPIRATION_TIME')),
    });
    return { accessToken: result.accessToken, user: result.user };
  }
}
