import { Injectable, Logger } from "@nestjs/common";
import { DEFAULT_ECONOMY, type EconomyParams } from "@bpredict/shared";
import { PrismaService } from "../prisma/prisma.service";

const CACHE_TTL_MS = 30_000;

/**
 * Reads `economy_params` with a short in-process cache so admin edits take effect
 * within 30 s without a redeploy. Missing keys fall back to DEFAULT_ECONOMY.
 */
@Injectable()
export class EconomyService {
  private readonly log = new Logger(EconomyService.name);
  private cache: EconomyParams | null = null;
  private cachedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<EconomyParams> {
    const now = Date.now();
    if (this.cache && now - this.cachedAt < CACHE_TTL_MS) return this.cache;
    try {
      const rows = await this.prisma.economyParam.findMany();
      const merged: Record<string, unknown> = { ...DEFAULT_ECONOMY };
      for (const r of rows) merged[r.key] = r.value;
      this.cache = merged as unknown as EconomyParams;
    } catch (e) {
      this.log.warn(`economy_params unavailable, using defaults: ${(e as Error).message}`);
      this.cache = DEFAULT_ECONOMY;
    }
    this.cachedAt = now;
    return this.cache;
  }

  invalidate() {
    this.cache = null;
  }
}
