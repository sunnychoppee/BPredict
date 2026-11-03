import { Injectable } from "@nestjs/common";
import { Prisma, type Currency, type LedgerEntry, type LedgerType } from "@bpredict/db";
import { PrismaService } from "../prisma/prisma.service";

export class InsufficientFundsError extends Error {
  constructor(public readonly currency: Currency) {
    super(`insufficient ${currency}`);
  }
}

export interface PostInput {
  userId: string;
  currency: Currency;
  /** Positive credits, negative debits. Must be a whole number. */
  amount: number | bigint;
  type: LedgerType;
  idempotencyKey: string;
  refType?: string;
  refId?: string;
  meta?: Prisma.InputJsonValue;
}

export interface PostResult {
  entry: LedgerEntry;
  /** false when the idempotency key had already been applied. */
  created: boolean;
}

type Tx = Prisma.TransactionClient;

/**
 * The only path through which coin / gem balances change.
 *
 * Guarantees:
 *  - append-only ledger, each row carries the post-balance;
 *  - balances never go negative (enforced in the UPDATE predicate, so it is race-safe);
 *  - idempotency by key: replaying a request returns the original entry and moves no money.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async post(input: PostInput): Promise<PostResult> {
    return this.prisma.$transaction((tx) => this.postIn(tx, input));
  }

  /** Use when the caller already holds a transaction (bets, settlement). */
  async postIn(tx: Tx, input: PostInput): Promise<PostResult> {
    const amount = BigInt(input.amount);
    if (amount === 0n) throw new Error("ledger amount must be non-zero");

    const existing = await tx.ledgerEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return { entry: existing, created: false };

    await tx.$executeRaw`
      INSERT INTO balances (user_id, currency, amount, updated_at)
      VALUES (${input.userId}::uuid, ${input.currency}::"Currency", 0, now())
      ON CONFLICT (user_id, currency) DO NOTHING`;

    const rows = await tx.$queryRaw<{ amount: bigint }[]>`
      UPDATE balances
         SET amount = amount + ${amount}, updated_at = now()
       WHERE user_id = ${input.userId}::uuid
         AND currency = ${input.currency}::"Currency"
         AND amount + ${amount} >= 0
      RETURNING amount`;

    const row = rows[0];
    if (!row) throw new InsufficientFundsError(input.currency);

    try {
      const entry = await tx.ledgerEntry.create({
        data: {
          userId: input.userId,
          currency: input.currency,
          amount,
          type: input.type,
          refType: input.refType,
          refId: input.refId,
          balanceAfter: row.amount,
          idempotencyKey: input.idempotencyKey,
          meta: input.meta,
        },
      });
      return { entry, created: true };
    } catch (e) {
      // Concurrent replay of the same key: the unique index wins, the transaction rolls back
      // our balance update, and we hand back the row that got there first.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const winner = await this.prisma.ledgerEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
        if (winner) return { entry: winner, created: false };
      }
      throw e;
    }
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
