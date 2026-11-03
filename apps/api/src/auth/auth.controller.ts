import { Body, Controller, Get, Headers, HttpCode, Post, Query, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { JwtService } from "@nestjs/jwt";
import {
  devLoginSchema,
  emailRequestSchema,
  emailVerifySchema,
  refreshSchema,
  telegramAuthSchema,
  type DevLoginInput,
  type EmailRequestInput,
  type EmailVerifyInput,
  type RefreshInput,
  type TelegramAuthInput,
} from "@bpredict/shared";
import { AuthService } from "./auth.service";
import { TokensService } from "./tokens.service";
import { ZodPipe } from "../common/zod.pipe";
import { JwtAuthGuard } from "./jwt.guard";
import { CurrentUser, type AuthUser } from "./current-user.decorator";
import { env, isLocal } from "../config/env";

const OAUTH_COOKIE = "bp_oauth";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
    private readonly jwt: JwtService,
  ) {}

  @Post("telegram")
  @HttpCode(200)
  telegram(@Body(new ZodPipe(telegramAuthSchema)) body: TelegramAuthInput, @Headers("user-agent") ua?: string) {
    return this.auth.loginTelegram(body.initData, ua);
  }

  /** Browser entry point: sets a short-lived signed cookie carrying state + PKCE verifier, then redirects to Google. */
  @Get("google")
  async google(@Res() res: Response) {
    const { url, state, codeVerifier } = this.auth.googleAuthUrl();
    const cookie = await this.jwt.signAsync({ state, codeVerifier }, { secret: env.JWT_SECRET, expiresIn: "10m" });
    res.cookie(OAUTH_COOKIE, cookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: !isLocal,
      maxAge: 10 * 60 * 1000,
      path: "/auth/google",
    });
    res.redirect(url);
  }

  @Get("google/callback")
  async googleCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
    @Headers("user-agent") ua?: string,
  ) {
    res.clearCookie(OAUTH_COOKIE, { path: "/auth/google" });
    if (error || !code || !state) return res.redirect(`${env.WEB_URL}/login?error=google_denied`);

    const raw = (req.cookies as Record<string, string | undefined>)[OAUTH_COOKIE];
    let saved: { state: string; codeVerifier: string };
    try {
      saved = await this.jwt.verifyAsync(raw ?? "", { secret: env.JWT_SECRET });
    } catch {
      return res.redirect(`${env.WEB_URL}/login?error=oauth_state`);
    }
    if (saved.state !== state) return res.redirect(`${env.WEB_URL}/login?error=oauth_state`);

    try {
      const tokens = await this.auth.loginGoogle(code, saved.codeVerifier, ua);
      const frag = new URLSearchParams({
        access: tokens.accessToken,
        refresh: tokens.refreshToken,
        exp: String(tokens.accessExpiresIn),
      });
      return res.redirect(`${env.WEB_URL}/auth/callback#${frag.toString()}`);
    } catch (e) {
      const reason = e instanceof UnauthorizedException ? "google_rejected" : "google_failed";
      return res.redirect(`${env.WEB_URL}/login?error=${reason}`);
    }
  }

  @Post("email/request")
  @HttpCode(200)
  emailRequest(@Body(new ZodPipe(emailRequestSchema)) body: EmailRequestInput) {
    return this.auth.requestMagicLink(body.email);
  }

  @Post("email/verify")
  @HttpCode(200)
  emailVerify(@Body(new ZodPipe(emailVerifySchema)) body: EmailVerifyInput, @Headers("user-agent") ua?: string) {
    return this.auth.loginMagicLink(body.token, ua);
  }

  @Post("refresh")
  @HttpCode(200)
  refresh(@Body(new ZodPipe(refreshSchema)) body: RefreshInput, @Headers("user-agent") ua?: string) {
    return this.tokens.rotate(body.refreshToken, ua);
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Body(new ZodPipe(refreshSchema)) body: RefreshInput) {
    await this.tokens.revoke(body.refreshToken);
  }

  @Post("logout-all")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async logoutAll(@CurrentUser() user: AuthUser) {
    await this.tokens.revokeAll(user.id);
  }

  /** Local development only (APP_ENV=local). Returns 401 elsewhere. */
  @Post("dev")
  @HttpCode(200)
  dev(@Body(new ZodPipe(devLoginSchema)) body: DevLoginInput, @Headers("user-agent") ua?: string) {
    return this.auth.loginDev(body.nickname, ua);
  }
}
