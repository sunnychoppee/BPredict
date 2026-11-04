import { Inject, Injectable, Logger } from "@nestjs/common";
import type Redis from "ioredis";
import { postLedgerEntry, type Currency, type DbTx, type LedgerPostInput, type LedgerPostResult } from "@bpredict/db";
import { userChannel, type ServerEvent } from "@bpredict/shared";
import { PrismaService } from "../prisma/prisma.service";
import { REDIS } from "../redis/redis.module";

export { InsufficientFundsError } from "@bpredict/db";
export type { LedgerPostInput as PostInput, LedgerPostResult as PostResult };

/**
 * Nest wrapper around the shared ledger primitive (`@bpredict/db` → `postLedgerEntry`).
 * All coin / gem movements in the API go through here.
 */
@Injectable()
export class LedgerService {
  private readonly log = new Logger(LedgerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Push the current balance to the user's live WS channel (best effort). */
  async publishBalance(userId: string, currency: Currency, reason: string): Promise<void> {
    try {
      const amount = await this.balance(userId, currency);
      const ev: ServerEvent = { t: "user.balance", currency, amount: Number(amount), reason };
      await this.redis.publish(userChannel(userId, "balance"), JSON.stringify(ev));
    } catch (e) {
      this.log.warn(`balance publish failed: ${(e as Error).message}`);
    }
  }

  async post(input: LedgerPostInput): Promise<LedgerPostResult> {
    return this.prisma.$transaction((tx) => this.postIn(tx, input));
  }

  /** Use when the caller already holds a transaction (bets, settlement). */
  postIn(tx: DbTx, input: LedgerPostInput): Promise<LedgerPostResult> {
    return postLedgerEntry(tx, this.prisma, input);
  }

  async balance(userId: string, currency: Currency): Promise<bigint> {
    const row = await this.prisma.balance.findUnique({ where: { userId_currency: { userId, currency } } });
    return row?.amount ?? 0n;
  }

  async balances(userId: string) {
    const rows = await this.prisma.balance.findMany({ where: { userId }, orderBy: { currency: "asc" } });
    const byCurrency = new Map(rows.map((r) => [r.currency, r.amount]));
    return (["COINS", "GEMS"] as const).map((currency) => ({ currency, amount: byCurrency.get(currency) ?? 0n }));
  }

  async history(userId: string, limit = 50, before?: bigint) {
    return this.prisma.ledgerEntry.findMany({
      where: { userId, ...(before ? { id: { lt: before } } : {}) },
      orderBy: { id: "desc" },
      take: Math.min(limit, 200),
    });
  }

  /** Ops check: recompute from ledger and compare with the cached balance. */
  async verify(userId: string): Promise<{ currency: Currency; cached: bigint; recomputed: bigint; ok: boolean }[]> {
    const sums = await this.prisma.ledgerEntry.groupBy({
      by: ["currency"],
      where: { userId },
      _sum: { amount: true },
    });
    const cached = await this.balances(userId);
    return cached.map((b) => {
      const recomputed = sums.find((s) => s.currency === b.currency)?._sum.amount ?? 0n;
      return { currency: b.currency, cached: b.amount, recomputed, ok: recomputed === b.amount };
    });
  }
}
