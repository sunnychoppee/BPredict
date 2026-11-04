import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { TokensService } from "./tokens.service";
import type { AuthUser } from "./current-user.decorator";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokensService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("missing bearer token");
    const payload = await this.tokens.verifyAccess(header.slice(7));
    req.user = { id: payload.sub };
    return true;
  }
}

/** Like JwtAuthGuard but anonymous requests pass through with `req.user` unset. */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokensService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return true;
    try {
      const payload = await this.tokens.verifyAccess(header.slice(7));
      req.user = { id: payload.sub };
    } catch {
      /* treat as anonymous */
    }
    return true;
  }
}
