import type { PrismaClient } from "@bpredict/db";
import { DEFAULT_ECONOMY, type EconomyParams } from "@bpredict/shared";
import { log } from "./log";

let cache: EconomyParams | null = null;
let cachedAt = 0;

export async function getEconomy(prisma: PrismaClient): Promise<EconomyParams> {
  if (cache && Date.now() - cachedAt < 30_000) return cache;
  try {
    const rows = await prisma.economyParam.findMany();
    const merged: Record<string, unknown> = { ...DEFAULT_ECONOMY };
    for (const r of rows) merged[r.key] = r.value;
    cache = merged as unknown as EconomyParams;
  } catch (e) {
    log.warn("economy", `using defaults: ${(e as Error).message}`);
    cache = DEFAULT_ECONOMY;
  }
  cachedAt = Date.now();
  return cache;
}
