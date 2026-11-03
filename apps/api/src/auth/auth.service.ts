import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { OAuth2Client } from "google-auth-library";
import { Resend } from "resend";
import { createHash, randomBytes } from "node:crypto";
import type { AuthProvider, User } from "@bpredict/db";
import { MAGIC_LINK_TTL_SEC, type AuthTokens } from "@bpredict/shared";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import { EconomyService } from "../economy/economy.service";
import { TokensService } from "./tokens.service";
import { verifyTelegramInitData, TelegramInitDataError } from "./telegram";
import { env, isLocal } from "../config/env";

interface IdentityInput {
  provider: AuthProvider;
  providerUid: string;
  email?: string | null;
  nickname: string;
  avatarUrl?: string | null;
  locale?: string;
  meta?: Record<string, unknown>;
}

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);
  private readonly google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? new OAuth2Client({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: env.GOOGLE_CALLBACK_URL })
      : null;
  private readonly resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly economy: EconomyService,
    private readonly tokens: TokensService,
  ) {}

  // ---------- Telegram ----------

  async loginTelegram(initData: string, userAgent?: string): Promise<AuthTokens> {
    if (!env.TELEGRAM_BOT_TOKEN) throw new ServiceUnavailableException("telegram login not configured");
    let parsed;
    try {
      parsed = verifyTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN);
    } catch (e) {
      if (e instanceof TelegramInitDataError) throw new UnauthorizedException(`telegram: ${e.message}`);
      throw e;
    }
    const u = parsed.user;
    const user = await this.findOrCreateByIdentity({
      provider: "TELEGRAM",
      providerUid: String(u.id),
      nickname: u.username ?? [u.first_name, u.last_name].filter(Boolean).join(" ") ?? "Player",
      avatarUrl: u.photo_url ?? null,
      locale: mapTelegramLocale(u.language_code),
      meta: { username: u.username, is_premium: u.is_premium },
    });
    return this.tokens.issue(user.id, userAgent);
  }

  // ---------- Google ----------

  googleAuthUrl(): { url: string; state: string; codeVerifier: string } {
    if (!this.google) throw new ServiceUnavailableException("google login not configured");
    const state = randomBytes(16).toString("base64url");
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    const url = this.google.generateAuthUrl({
      access_type: "online",
      scope: ["openid", "email", "profile"],
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256" as never,
      prompt: "select_account",
    });
    return { url, state, codeVerifier };
  }

  async loginGoogle(code: string, codeVerifier: string, userAgent?: string): Promise<AuthTokens> {
    if (!this.google) throw new ServiceUnavailableException("google login not configured");
    const { tokens } = await this.google.getToken({ code, codeVerifier });
    if (!tokens.id_token) throw new UnauthorizedException("google: no id_token");
    const ticket = await this.google.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email || !p.email_verified) throw new UnauthorizedException("google: unverified account");
    const user = await this.findOrCreateByIdentity({
      provider: "GOOGLE",
      providerUid: p.sub,
      email: p.email.toLowerCase(),
      nickname: p.given_name ?? p.name ?? p.email.split("@")[0] ?? "Player",
      avatarUrl: p.picture ?? null,
      locale: mapGoogleLocale(p.locale),
    });
    return this.tokens.issue(user.id, userAgent);
  }

  // ---------- Email magic link ----------

  async requestMagicLink(emailRaw: string): Promise<{ sent: boolean; devLink?: string }> {
    const email = emailRaw.trim().toLowerCase();
    const token = randomBytes(32).toString("base64url");
    await this.prisma.magicLink.create({
      data: {
        email,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_SEC * 1000),
      },
    });
    const link = `${env.WEB_URL}/auth/magic?token=${token}`;

    if (!this.resend) {
      if (isLocal) {
        this.log.warn(`RESEND_API_KEY unset — magic link for ${email}: ${link}`);
        return { sent: false, devLink: link };
      }
      throw new ServiceUnavailableException("email login not configured");
    }

    const { error } = await this.resend.emails.send({
      from: env.RESEND_FROM,
      to: email,
      subject: "登入 BPredict",
      html: `<p>點擊以下連結登入（15 分鐘內有效）：</p><p><a href="${link}">${link}</a></p><p>若非本人操作請忽略。</p>`,
    });
    if (error) {
      this.log.error(`resend: ${error.message}`);
      throw new ServiceUnavailableException("failed to send email");
    }
    return { sent: true, ...(isLocal ? { devLink: link } : {}) };
  }

  async loginMagicLink(token: string, userAgent?: string): Promise<AuthTokens> {
    const row = await this.prisma.magicLink.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row || row.consumedAt || row.expiresAt < new Date()) throw new UnauthorizedException("link invalid or expired");
    const consumed = await this.prisma.magicLink.updateMany({
      where: { id: row.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count === 0) throw new UnauthorizedException("link already used");
    const user = await this.findOrCreateByIdentity({
      provider: "EMAIL",
      providerUid: row.email,
      email: row.email,
      nickname: row.email.split("@")[0] ?? "Player",
    });
    return this.tokens.issue(user.id, userAgent);
  }

  // ---------- Local-only dev login ----------

  async loginDev(nickname: string, userAgent?: string): Promise<AuthTokens> {
    if (!isLocal) throw new UnauthorizedException();
    const user = await this.findOrCreateByIdentity({
      provider: "EMAIL",
      providerUid: `dev:${nickname.toLowerCase()}@local`,
      email: `${nickname.toLowerCase()}@dev.local`,
      nickname,
    });
    return this.tokens.issue(user.id, userAgent);
  }

  // ---------- Shared ----------

  /**
   * Finds the user owning (provider, providerUid) or creates one. New users receive the
   * welcome pack exactly once (idempotency key `welcome:{userId}`).
   */
  private async findOrCreateByIdentity(input: IdentityInput): Promise<User> {
    const existing = await this.prisma.authIdentity.findUnique({
      where: { provider_providerUid: { provider: input.provider, providerUid: input.providerUid } },
      include: { user: true },
    });
    if (existing) {
      if (existing.user.frozenAt) throw new UnauthorizedException("account frozen");
      return existing.user;
    }

    const params = await this.economy.get();
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          nickname: input.nickname.slice(0, 32),
          avatarUrl: input.avatarUrl ?? undefined,
          locale: input.locale ?? "zh-Hant",
          identities: {
            create: {
              provider: input.provider,
              providerUid: input.providerUid,
              email: input.email ?? undefined,
              meta: input.meta as never,
            },
          },
        },
      });
      await this.ledger.postIn(tx, {
        userId: user.id,
        currency: "COINS",
        amount: params.welcome_pack,
        type: "WELCOME",
        idempotencyKey: `welcome:${user.id}`,
      });
      await tx.$executeRaw`
        INSERT INTO balances (user_id, currency, amount, updated_at)
        VALUES (${user.id}::uuid, 'GEMS'::"Currency", 0, now())
        ON CONFLICT DO NOTHING`;
      return user;
    });
  }
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function mapTelegramLocale(code?: string): string {
  if (!code) return "zh-Hant";
  const c = code.toLowerCase();
  if (c.startsWith("zh-hans") || c === "zh-cn" || c === "zh") return "zh-Hans";
  if (c.startsWith("zh")) return "zh-Hant";
  if (c.startsWith("en")) return "en";
  return "zh-Hant";
}

function mapGoogleLocale(code?: string): string {
  return mapTelegramLocale(code);
}
