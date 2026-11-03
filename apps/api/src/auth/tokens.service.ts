import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes } from "node:crypto";
import { ACCESS_TOKEN_TTL_SEC, REFRESH_TOKEN_TTL_SEC, type AuthTokens } from "@bpredict/shared";
import { PrismaService } from "../prisma/prisma.service";
import { env } from "../config/env";

export interface AccessPayload {
  sub: string;
  typ: "access";
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async issue(userId: string, userAgent?: string): Promise<AuthTokens> {
    const accessToken = await this.jwt.signAsync({ sub: userId, typ: "access" } satisfies AccessPayload, {
      secret: env.JWT_SECRET,
      expiresIn: ACCESS_TOKEN_TTL_SEC,
    });
    const refreshToken = randomBytes(48).toString("base64url");
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000),
        userAgent: userAgent?.slice(0, 255),
      },
    });
    return { accessToken, refreshToken, accessExpiresIn: ACCESS_TOKEN_TTL_SEC };
  }

  async verifyAccess(token: string): Promise<AccessPayload> {
    try {
      const payload = await this.jwt.verifyAsync<AccessPayload>(token, { secret: env.JWT_SECRET });
      if (payload.typ !== "access") throw new Error("wrong typ");
      return payload;
    } catch {
      throw new UnauthorizedException("invalid access token");
    }
  }

  /** Rotates: the presented refresh token is revoked and a fresh pair is issued. */
  async rotate(refreshToken: string, userAgent?: string): Promise<AuthTokens> {
    const hash = sha256(refreshToken);
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
    if (!row || row.revokedAt || row.expiresAt < new Date()) throw new UnauthorizedException("invalid refresh token");
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    return this.issue(row.userId, userAgent);
  }

  async revoke(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAll(userId: string) {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
