import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { TokensService } from "../auth/tokens.service";
import type { AuthUser } from "../auth/current-user.decorator";

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && env.ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * Admin = authenticated user with at least one identity email listed in ADMIN_EMAILS.
 * Evaluated per request (no caching) so removing an email takes effect immediately.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly tokens: TokensService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new ForbiddenException("admin only");
    let sub: string;
    try {
      sub = (await this.tokens.verifyAccess(header.slice(7))).sub;
    } catch {
      throw new ForbiddenException("admin only");
    }
    if (env.ADMIN_EMAILS.length === 0) throw new ForbiddenException("admin console disabled (ADMIN_EMAILS empty)");
    const ids = await this.prisma.authIdentity.findMany({ where: { userId: sub }, select: { email: true } });
    if (!ids.some((i) => isAdminEmail(i.email))) throw new ForbiddenException("admin only");
    req.user = { id: sub };
    return true;
  }
}
