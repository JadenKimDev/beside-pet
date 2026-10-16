/**
 * auth.controller.ts — first-run setup, login/logout, my info.
 *  GET  /v1/auth/setup   is first-run setup still pending?
 *  POST /v1/auth/setup   one-time token → first admin account (+ signed in)
 *  POST  /v1/auth/register          public account application (→ pending, admin approval required)
 *  POST  /v1/auth/login             username + password → JWT (httpOnly cookie)
 *  POST  /v1/auth/logout            expire the cookie
 *  GET   /v1/auth/me                current account incl. settings (guard required)
 *  PATCH /v1/auth/me/chat-language  set the conversation language (guard required)
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { LoginUseCase } from '../application/login.usecase';
import { MyProfileQuery } from '../application/my-profile.query';
import { RegisterAccountUseCase } from '../application/register-account.usecase';
import { SetupAdminUseCase } from '../application/setup-admin.usecase';
import { UpdateChatLanguageUseCase } from '../application/update-chat-language.usecase';
import type { SetupTokenGate } from '../domain/port/setup-token.port';
import { SETUP_TOKEN_GATE } from '../domain/port/tokens';
import type { AuthenticatedAccount } from '../guard/authenticated-account';
import { AUTH_COOKIE } from '../guard/cookie';
import { CurrentAccount } from '../guard/current-account.decorator';
import { JwtAuthGuard } from '../guard/jwt-auth.guard';
import { AccountResponse } from './dto/account.response';
import { LoginRequest } from './dto/login.request';
import { RegisterRequest } from './dto/register.request';
import { SetupRequest } from './dto/setup.request';
import { SetupStatusResponse } from './dto/setup-status.response';
import { UpdateChatLanguageRequest } from './dto/update-chat-language.request';

const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7d

const setAuthCookie = (res: Response, token: string, secure: boolean): void => {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  });
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  /** Cookies are Secure in production only (local dev runs over plain http). */
  private readonly secureCookies: boolean;

  constructor(
    config: ConfigService,
    private readonly login: LoginUseCase,
    private readonly setupAdmin: SetupAdminUseCase,
    private readonly registerAccount: RegisterAccountUseCase,
    private readonly myProfile: MyProfileQuery,
    private readonly updateChatLanguage: UpdateChatLanguageUseCase,
    @Inject(SETUP_TOKEN_GATE) private readonly setupGate: SetupTokenGate,
  ) {
    this.secureCookies = config.get<string>('NODE_ENV') === 'production';
  }

  @Post('register')
  @HttpCode(201)
  register(@Body() body: RegisterRequest): Promise<AccountResponse> {
    return this.registerAccount.execute({
      username: body.username,
      password: body.password,
      company: body.company,
    });
  }

  @Get('setup')
  setupStatus(): SetupStatusResponse {
    return { required: this.setupGate.isPending() };
  }

  @Post('setup')
  @HttpCode(200)
  async setup(
    @Body() body: SetupRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccountResponse> {
    await this.setupAdmin.execute({
      token: body.token,
      username: body.username,
      password: body.password,
      company: body.company,
    });
    // Sign the operator in right away so they land in the dashboard.
    const result = await this.login.execute({ username: body.username, password: body.password });
    setAuthCookie(res, result.token, this.secureCookies);
    return result.account;
  }

  @Post('login')
  @HttpCode(200)
  async signIn(
    @Body() body: LoginRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccountResponse> {
    const result = await this.login.execute({ username: body.username, password: body.password });
    setAuthCookie(res, result.token, this.secureCookies);
    return result.account;
  }

  @Post('logout')
  @HttpCode(204)
  signOut(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(AUTH_COOKIE, { path: '/' });
  }

  @Get('me')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard)
  me(@CurrentAccount() account: AuthenticatedAccount): Promise<AccountResponse> {
    return this.myProfile.execute(account.id);
  }

  @Patch('me/chat-language')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard)
  setChatLanguage(
    @Body() body: UpdateChatLanguageRequest,
    @CurrentAccount() account: AuthenticatedAccount,
  ): Promise<AccountResponse> {
    return this.updateChatLanguage.execute({
      accountId: account.id,
      chatLanguage: body.chatLanguage,
    });
  }
}
