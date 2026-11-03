import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { Request } from "express";
import type { AuthUser } from "../auth/current-user.decorator";

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const RATE_PER_SEC = 5;
const BURST = 10;

/**
 * Per-user token bucket (5 req/s, burst 10). In-memory: good enough for a single api
 * replica; swap for a Redis-backed bucket when scaling out.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const key = req.user?.id ?? req.ip ?? "anon";
    const now = Date.now();
    const b = this.buckets.get(key) ?? { tokens: BURST, updatedAt: now };
    b.tokens = Math.min(BURST, b.tokens + ((now - b.updatedAt) / 1000) * RATE_PER_SEC);
    b.updatedAt = now;
    if (b.tokens < 1) {
      this.buckets.set(key, b);
      throw new HttpException("too many requests", HttpStatus.TOO_MANY_REQUESTS);
    }
    b.tokens -= 1;
    this.buckets.set(key, b);
    if (this.buckets.size > 50_000) this.buckets.clear();
    return true;
  }
}
