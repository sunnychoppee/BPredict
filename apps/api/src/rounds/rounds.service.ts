import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type Redis from "ioredis";
import { toRoundResult, toRoundView, type Side } from "@bpredict/db";
import {
  redisKeys,
  tableChannel,
  userChannel,
  type PriceTick,
  type RoundResult,
  type RoundView,
  type ServerEvent,
  type TableSnapshot,
} from "@bpredict/shared";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService, InsufficientFundsError } from "../ledger/ledger.service";
import { EconomyService } from "../economy/economy.service";
import { REDIS } from "../redis/redis.module";

@Injectable()
export class RoundsService {
  private readonly log = new Logger(RoundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly economy: EconomyService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  // ---------- read ----------

  async snapshot(tableId: string): Promise<TableSnapshot> {
    const table = await this.prisma.gameTable.findUnique({ where: { id: tableId } });
    if (!table) throw new NotFoundException("table not found");

    const live = await this.prisma.round.findMany({
      where: { tableId, status: { in: ["BETTING", "LOCKED"] } },
      orderBy: { roundNo: "desc" },
    });
    const betting = live.find((r) => r.status === "BETTING") ?? null;
    const locked = live.find((r) => r.status === "LOCKED") ?? null;

    const [bettingView, lockedView, price, ticks, results] = await Promise.all([
      betting ? this.withLivePools(toRoundView(betting)) : null,
      locked ? toRoundView(locked) : null,
      this.latestPrice(table.symbol),
      this.recentTicks(table.symbol, 600),
      this.recentResults(tableId, 100),
    ]);

    return { tableId, serverTime: Date.now(), betting: bettingView, locked: lockedView, price, ticks, results };
  }

  async history(tableId: string, limit = 50, beforeRoundNo?: number) {
    const rows = await this.prisma.round.findMany({
      where: {
        tableId,
        status: { in: ["SETTLED", "VOIDED"] },
        ...(beforeRoundNo ? { roundNo: { lt: BigInt(beforeRoundNo) } } : {}),
      },
      orderBy: { roundNo: "desc" },
      take: Math.min(limit, 200),
    });
    return rows.map((r) => ({ ...toRoundView(r), priceSource: r.priceSource, voidReason: r.voidReason, settledAt: r.settledAt?.getTime() ?? null }));
  }

  async myBets(roundId: string, userId: string) {
    const rows = await this.prisma.bet.findMany({
      where: { roundId, userId, cancelledAt: null },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((b) => ({ id: b.id, side: b.side, amount: Number(b.amount), createdAt: b.createdAt.getTime() }));
  }

  // ---------- write ----------

  async placeBet(roundId: string, userId: string, side: Side, amount: number, nonce: string) {
    const params = await this.economy.get();
    if (amount < params.min_bet) throw new BadRequestException(`minimum bet is ${params.min_bet}`);
    const key = `bet:${roundId}:${userId}:${nonce}`;

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.bet.findUnique({ where: { idempotencyKey: key } });
      if (existing) return { bet: existing, created: false };

      const [round] = await tx.$queryRaw<{ id: string; status: string; lock_at: Date; table_id: string }[]>`
        SELECT id, status, lock_at, table_id FROM rounds WHERE id = ${roundId}::uuid FOR SHARE`;
      if (!round) throw new NotFoundException("round not found");
      if (round.status !== "BETTING" || round.lock_at.getTime() <= Date.now()) throw new BadRequestException("betting closed");

      // Serialise this user's bets for the round so the per-round cap holds under concurrency.
      const [user] = await tx.$queryRaw<{ id: string; is_vip: boolean; frozen_at: Date | null }[]>`
        SELECT id, is_vip, frozen_at FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      if (!user) throw new NotFoundException("user not found");
      if (user.frozen_at) throw new BadRequestException("account frozen");

      const agg = await tx.bet.aggregate({ where: { roundId, userId, cancelledAt: null }, _sum: { amount: true } });
      const already = Number(agg._sum.amount ?? 0n);
      const cap = user.is_vip ? params.max_bet_per_round_vip : params.max_bet_per_round_normal;
      if (already + amount > cap) throw new BadRequestException(`per-round limit is ${cap}`);

      try {
        await this.ledger.postIn(tx, {
          userId,
          currency: "COINS",
          amount: -amount,
          type: "BET",
          refType: "round",
          refId: roundId,
          idempotencyKey: key,
        });
      } catch (e) {
        if (e instanceof InsufficientFundsError) throw new BadRequestException("insufficient coins");
        throw e;
      }

      const bet = await tx.bet.create({ data: { roundId, userId, side, amount: BigInt(amount), idempotencyKey: key } });
      return { bet, created: true, tableId: round.table_id };
    });

    if (result.created && "tableId" in result && result.tableId) {
      await this.bumpPools(result.tableId, roundId, side, amount);
      await this.publishBalance(userId, "bet");
    }
    return { id: result.bet.id, side: result.bet.side, amount: Number(result.bet.amount), created: result.created };
  }

  async cancelBets(roundId: string, userId: string) {
    const out = await this.prisma.$transaction(async (tx) => {
      const [round] = await tx.$queryRaw<{ id: string; status: string; lock_at: Date; table_id: string }[]>`
        SELECT id, status, lock_at, table_id FROM rounds WHERE id = ${roundId}::uuid FOR SHARE`;
      if (!round) throw new NotFoundException("round not found");
      if (round.status !== "BETTING" || round.lock_at.getTime() <= Date.now()) throw new BadRequestException("betting closed");

      const bets = await tx.$queryRaw<{ id: string; side: Side; amount: bigint }[]>`
        SELECT id, side, amount FROM bets
         WHERE round_id = ${roundId}::uuid AND user_id = ${userId}::uuid AND cancelled_at IS NULL
         FOR UPDATE`;
      const refunded: Record<Side, number> = { BANKER: 0, PLAYER: 0 };
      for (const b of bets) {
        await this.ledger.postIn(tx, {
          userId,
          currency: "COINS",
          amount: b.amount,
          type: "BET_CANCEL",
          refType: "bet",
          refId: b.id,
          idempotencyKey: `bet_cancel:${b.id}`,
        });
        await tx.bet.update({ where: { id: b.id }, data: { cancelledAt: new Date() } });
        refunded[b.side] += Number(b.amount);
      }
      return { tableId: round.table_id, refunded, count: bets.length };
    });

    if (out.count > 0) {
      if (out.refunded.BANKER) await this.bumpPools(out.tableId, roundId, "BANKER", -out.refunded.BANKER);
      if (out.refunded.PLAYER) await this.bumpPools(out.tableId, roundId, "PLAYER", -out.refunded.PLAYER);
      await this.publishBalance(userId, "bet_cancel");
    }
    return { cancelled: out.count, refunded: out.refunded.BANKER + out.refunded.PLAYER };
  }

  // ---------- redis helpers ----------

  private async withLivePools(view: RoundView): Promise<RoundView> {
    try {
      const h = await this.redis.hgetall(redisKeys.roundPools(view.id));
      if (h.BANKER !== undefined || h.PLAYER !== undefined) {
        return { ...view, poolBanker: Number(h.BANKER ?? 0), poolPlayer: Number(h.PLAYER ?? 0) };
      }
    } catch {
      /* fall back to DB values */
    }
    return view;
  }

  private async bumpPools(tableId: string, roundId: string, side: Side, delta: number) {
    try {
      const k = redisKeys.roundPools(roundId);
      await this.redis.hincrby(k, side, delta);
      await this.redis.expire(k, 60 * 60);
      const h = await this.redis.hgetall(k);
      const ev: ServerEvent = {
        t: "pool.update",
        tableId,
        roundId,
        poolBanker: Number(h.BANKER ?? 0),
        poolPlayer: Number(h.PLAYER ?? 0),
      };
      await this.redis.publish(tableChannel(tableId, "pool.update"), JSON.stringify(ev));
    } catch (e) {
      this.log.warn(`pool publish failed: ${(e as Error).message}`);
    }
  }

  private async publishBalance(userId: string, reason: string) {
    try {
      const amount = await this.ledger.balance(userId, "COINS");
      const ev: ServerEvent = { t: "user.balance", currency: "COINS", amount: Number(amount), reason };
      await this.redis.publish(userChannel(userId, "balance"), JSON.stringify(ev));
    } catch (e) {
      this.log.warn(`balance publish failed: ${(e as Error).message}`);
    }
  }

  private async latestPrice(symbol: string): Promise<PriceTick | null> {
    try {
      const h = await this.redis.hgetall(redisKeys.price(symbol));
      if (!h.price) return null;
      return { price: Number(h.price), source: h.source ?? "?", ts: Number(h.ts) };
    } catch {
      return null;
    }
  }

  private async recentTicks(symbol: string, n: number): Promise<PriceTick[]> {
    try {
      const raw = await this.redis.lrange(redisKeys.priceTicks(symbol), 0, n - 1);
      return raw.map((s) => JSON.parse(s) as PriceTick).reverse();
    } catch {
      return [];
    }
  }

  private async recentResults(tableId: string, n: number): Promise<RoundResult[]> {
    try {
      const raw = await this.redis.lrange(redisKeys.tableResults(tableId), 0, n - 1);
      if (raw.length) return raw.map((s) => JSON.parse(s) as RoundResult).reverse();
    } catch {
      /* fall through */
    }
    const rows = await this.prisma.round.findMany({
      where: { tableId, status: { in: ["SETTLED", "VOIDED"] } },
      orderBy: { roundNo: "desc" },
      take: n,
    });
    return rows.map(toRoundResult).reverse();
  }
}
