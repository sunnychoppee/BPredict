import { Prisma, type Currency, type LedgerEntry, type LedgerType, type PrismaClient } from "@prisma/client";

export class InsufficientFundsError extends Error {
  constructor(public readonly currency: Currency) {
    super(`insufficient ${currency}`);
    this.name = "InsufficientFundsError";
  }
}

export interface LedgerPostInput {
  userId: string;
  currency: Currency;
  /** Positive credits, negative debits. Whole numbers only. */
  amount: number | bigint;
  type: LedgerType;
  idempotencyKey: string;
  refType?: string;
  refId?: string;
  meta?: Prisma.InputJsonValue;
}

export interface LedgerPostResult {
  entry: LedgerEntry;
  /** false when the idempotency key had already been applied. */
  created: boolean;
}

export type DbTx = Prisma.TransactionClient;

/**
 * The single primitive through which coin / gem balances change. Shared by api and worker.
 *
 *  - append-only ledger row with post-balance;
 *  - balance can never go negative (guarded inside the UPDATE predicate, race-safe);
 *  - idempotent by key: replays return the original entry and move nothing.
 *
 * Must run inside a transaction (`tx`). `root` is used only to read back a row written by a
 * concurrent transaction after a unique-violation.
 */
export async function postLedgerEntry(tx: DbTx, root: PrismaClient, input: LedgerPostInput): Promise<LedgerPostResult> {
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
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const winner = await root.ledgerEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (winner) return { entry: winner, created: false };
    }
    throw e;
  }
}
