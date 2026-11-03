import type Redis from "ioredis";
import { postLedgerEntry, toRoundResult, toRoundView, type PrismaClient, type Round, type Side } from "@bpredict/db";
import {
  PRICE_GRACE_MS,
  computeSettlement,
  redisKeys,
  roundNoAt,
  roundTimes,
  tableChannel,
  userChannel,
  type RoundResult,
  type ServerEvent,
  type StakeInput,
} from "@bpredict/shared";
import { env } from "./env";
import { getEconomy } from "./economy";
import { log } from "./log";
import type { PriceFeed } from "./price-feed";
import { publish } from "./redis";

const LEADER_TTL_MS = 10_000;
/** If the feed has been dark this long we stop opening new rounds (PRD §4.2). */
const FEED_DOWN_PAUSE_MS = 60_000;

const RENEW_LUA = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) else return 0 end`;

export class RoundEngine {
  private leader = false;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private feedLastOk = Date.now();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    private readonly feed: PriceFeed,
    private readonly tableId: string,
    private readonly roundSeconds: number,
  ) {}

  start() {
    this.timer = setInterval(() => void this.tick(), 1000);
    log.info("engine", `started (instance ${env.WORKER_INSTANCE_ID})`);
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.leader) {
      try {
        const cur = await this.redis.get(redisKeys.schedulerLeader);
        if (cur === env.WORKER_INSTANCE_ID) await this.redis.del(redisKeys.schedulerLeader);
      } catch {
        /* lock will expire */
      }
    }
  }

  // ---------------------------------------------------------------- tick

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      if (!(await this.acquireOrRenewLeadership())) return;
      const now = Date.now();
      if (this.feed.latest()) this.feedLastOk = now;
      const feedDown = now - this.feedLastOk > FEED_DOWN_PAUSE_MS;

      const cur = roundNoAt(now, this.roundSeconds);
      if (!feedDown) {
        await this.ensureRound(cur);
        await this.ensureRound(cur + 1);
      }

      const open = await this.prisma.round.findMany({
        where: { tableId: this.tableId, status: { in: ["SCHEDULED", "BETTING", "LOCKED"] } },
        orderBy: { roundNo: "asc" },
      });

      let changed = false;
      for (const r of open) {
        if (r.status === "SCHEDULED" && r.betStartAt.getTime() <= now) changed = (await this.promote(r)) || changed;
        else if (r.status === "BETTING" && r.lockAt.getTime() <= now) changed = (await this.lock(r, now)) || changed;
        else if (r.status === "LOCKED" && r.closeAt.getTime() <= now) changed = (await this.settle(r, now)) || changed;
      }
      if (changed || now % 10_000 < 1000) await this.publishState();
    } catch (e) {
      log.error("engine", "tick failed", e);
    } finally {
      this.busy = false;
    }
  }

  private async acquireOrRenewLeadership(): Promise<boolean> {
    try {
      if (this.leader) {
        const ok = await this.redis.eval(RENEW_LUA, 1, redisKeys.schedulerLeader, env.WORKER_INSTANCE_ID, LEADER_TTL_MS);
        if (ok === 1) return true;
        this.leader = false;
        log.warn("engine", "lost leadership");
      }
      const res = await this.redis.set(redisKeys.schedulerLeader, env.WORKER_INSTANCE_ID, "PX", LEADER_TTL_MS, "NX");
      if (res === "OK") {
        this.leader = true;
        log.info("engine", "acquired leadership");
      }
      return this.leader;
    } catch (e) {
      log.warn("engine", `leader lock error: ${(e as Error).message}`);
      this.leader = false;
      return false;
    }
  }

  // ---------------------------------------------------------------- transitions

  private async ensureRound(roundNo: number) {
    const t = roundTimes(roundNo, this.roundSeconds);
    const status = t.betStartAt.getTime() <= Date.now() ? "BETTING" : "SCHEDULED";
    await this.prisma.round.upsert({
      where: { tableId_roundNo: { tableId: this.tableId, roundNo: BigInt(roundNo) } },
      create: { tableId: this.tableId, roundNo: BigInt(roundNo), status, ...t },
      update: {},
    });
  }

  private async promote(r: Round): Promise<boolean> {
    const n = await this.prisma.round.updateMany({ where: { id: r.id, status: "SCHEDULED" }, data: { status: "BETTING" } });
    if (n.count) log.info("engine", `round ${r.roundNo} BETTING`);
    return n.count > 0;
  }

  private async lock(r: Round, now: number): Promise<boolean> {
    const px = this.feed.latest();
    if (!px) {
      if (now - r.lockAt.getTime() > PRICE_GRACE_MS) return this.voidRound(r, "no price at lock");
      return false;
    }
    const pools = await this.pools(r.id);
    const n = await this.prisma.round.updateMany({
      where: { id: r.id, status: "BETTING" },
      data: {
        status: "LOCKED",
        lockPrice: px.price.toFixed(2),
        priceSource: px.source,
        lockedAt: new Date(now),
        poolBanker: pools.BANKER,
        poolPlayer: pools.PLAYER,
      },
    });
    if (!n.count) return false;
    log.info("engine", `round ${r.roundNo} LOCKED @ ${px.price} (${px.source}) B=${pools.BANKER} P=${pools.PLAYER}`);
    const ev: ServerEvent = { t: "round.locked", tableId: this.tableId, roundId: r.id, roundNo: Number(r.roundNo), lockPrice: px.price, source: px.source };
    await publish(this.redis, tableChannel(this.tableId, "round.locked"), ev);
    return true;
  }

  private async settle(r: Round, now: number): Promise<boolean> {
    const px = this.feed.latest();
    if (!px) {
      if (now - r.closeAt.getTime() > PRICE_GRACE_MS) return this.voidRound(r, "no price at close");
      return false;
    }
    const lockPrice = Number(r.lockPrice?.toString() ?? NaN);
    if (!Number.isFinite(lockPrice)) return this.voidRound(r, "missing lock price");
    const closePrice = Number(px.price.toFixed(2));
    if (closePrice === lockPrice) return this.voidRound(r, "push", closePrice, px.source);

    const winner: Side = closePrice > lockPrice ? "BANKER" : "PLAYER";
    const params = await getEconomy(this.prisma);

    const outcome = await this.prisma.$transaction(
      async (tx) => {
        const [locked] = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM rounds WHERE id = ${r.id}::uuid FOR UPDATE`;
        if (locked?.status !== "LOCKED") return null;

        const bets = await tx.bet.findMany({ where: { roundId: r.id, cancelledAt: null } });
        const userIds = [...new Set(bets.map((b) => b.userId))];
        const stats = await tx.userStats.findMany({ where: { userId: { in: userIds } } });
        const streakOf = new Map(stats.map((s) => [s.userId, s.currentStreak]));

        const stakes: StakeInput[] = bets.map((b) => ({ userId: b.userId, side: b.side, amount: Number(b.amount), currentStreak: streakOf.get(b.userId) ?? 0 }));
        const res = computeSettlement(winner, stakes, {
          feeRate: params.fee_rate,
          seedPerSide: params.seed_pool_per_side,
          streakBonus: params.streak_bonus,
          streakBonusCap: params.streak_bonus_cap,
        });

        const payoutByUser = new Map(res.payouts.map((p) => [p.userId, p]));
        const perUser = new Map<string, { staked: number; paid: number; won: boolean; streak: number }>();

        for (const p of res.payouts) {
          if (p.total > 0) {
            await postLedgerEntry(tx, this.prisma, {
              userId: p.userId,
              currency: "COINS",
              amount: p.total,
              type: "PAYOUT",
              refType: "round",
              refId: r.id,
              idempotencyKey: `settle:${r.id}:${p.userId}`,
              meta: { base: p.base, streakBonus: p.streakBonus, stake: p.stake },
            });
          }
          await tx.roundPayout.create({
            data: { roundId: r.id, userId: p.userId, side: p.side, stake: BigInt(p.stake), payout: BigInt(p.base), streakBonus: BigInt(p.streakBonus) },
          });
        }

        for (const b of bets) {
          const u = perUser.get(b.userId) ?? { staked: 0, paid: 0, won: false, streak: streakOf.get(b.userId) ?? 0 };
          u.staked += Number(b.amount);
          perUser.set(b.userId, u);
        }
        for (const [userId, u] of perUser) {
          const p = payoutByUser.get(userId);
          u.paid = p?.total ?? 0;
          u.won = !!p;
          u.streak = u.won ? u.streak + 1 : 0;
          await tx.$executeRaw`
            INSERT INTO user_stats (user_id, total_rounds, wins, current_streak, max_streak, net_profit, updated_at)
            VALUES (${userId}::uuid, 1, ${u.won ? 1 : 0}, ${u.streak}, ${u.streak}, ${BigInt(u.paid - u.staked)}, now())
            ON CONFLICT (user_id) DO UPDATE SET
              total_rounds = user_stats.total_rounds + 1,
              wins = user_stats.wins + ${u.won ? 1 : 0},
              current_streak = ${u.streak},
              max_streak = GREATEST(user_stats.max_streak, ${u.streak}),
              net_profit = user_stats.net_profit + ${BigInt(u.paid - u.staked)},
              updated_at = now()`;
        }

        await tx.round.update({
          where: { id: r.id },
          data: {
            status: "SETTLED",
            closePrice: closePrice.toFixed(2),
            priceSource: px.source,
            settledAt: new Date(),
            poolBanker: BigInt(res.poolBanker),
            poolPlayer: BigInt(res.poolPlayer),
            fee: BigInt(res.fee),
            winner,
            payoutPerUnit: res.payoutPerUnit.toFixed(6),
            destroyed: BigInt(res.destroyed),
          },
        });
        return { res, perUser };
      },
      { timeout: 30_000 },
    );

    if (!outcome) return false;
    const { res, perUser } = outcome;
    log.info("engine", `round ${r.roundNo} SETTLED ${winner} @ ${closePrice} (lock ${lockPrice}) ppu=${res.payoutPerUnit.toFixed(4)} winners=${res.payouts.length} destroyed=${res.destroyed}`);

    const settled = await this.prisma.round.findUniqueOrThrow({ where: { id: r.id } });
    await this.recordResult(toRoundResult(settled));
    const ev: ServerEvent = {
      t: "round.settled",
      tableId: this.tableId,
      roundId: r.id,
      roundNo: Number(r.roundNo),
      winner,
      lockPrice,
      closePrice,
      poolBanker: res.poolBanker,
      poolPlayer: res.poolPlayer,
      payoutPerUnit: res.payoutPerUnit,
      winners: res.payouts.length,
    };
    await publish(this.redis, tableChannel(this.tableId, "round.settled"), ev);
    for (const [userId, u] of perUser) {
      const p = res.payouts.find((x) => x.userId === userId);
      const pe: ServerEvent = { t: "user.payout", roundId: r.id, roundNo: Number(r.roundNo), stake: u.staked, payout: u.paid, streakBonus: p?.streakBonus ?? 0, won: u.won, streak: u.streak };
      await publish(this.redis, userChannel(userId, "payout"), pe);
      await this.publishBalance(userId, "payout");
    }
    await this.redis.del(redisKeys.roundPools(r.id)).catch(() => undefined);
    return true;
  }

  private async voidRound(r: Round, reason: string, closePrice?: number, source?: string): Promise<boolean> {
    const refunded = await this.prisma.$transaction(
      async (tx) => {
        const [cur] = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM rounds WHERE id = ${r.id}::uuid FOR UPDATE`;
        if (!cur || !["BETTING", "LOCKED"].includes(cur.status)) return null;
        const sums = await tx.bet.groupBy({ by: ["userId"], where: { roundId: r.id, cancelledAt: null }, _sum: { amount: true } });
        for (const s of sums) {
          const amt = s._sum.amount ?? 0n;
          if (amt > 0n) {
            await postLedgerEntry(tx, this.prisma, { userId: s.userId, currency: "COINS", amount: amt, type: "REFUND", refType: "round", refId: r.id, idempotencyKey: `void:${r.id}:${s.userId}` });
          }
        }
        const pools = await this.pools(r.id, tx);
        await tx.round.update({
          where: { id: r.id },
          data: {
            status: "VOIDED",
            voidReason: reason,
            settledAt: new Date(),
            closePrice: closePrice != null ? closePrice.toFixed(2) : undefined,
            priceSource: source,
            poolBanker: pools.BANKER,
            poolPlayer: pools.PLAYER,
            fee: 0n,
            destroyed: 0n,
          },
        });
        return sums.map((s) => s.userId);
      },
      { timeout: 30_000 },
    );
    if (!refunded) return false;
    log.warn("engine", `round ${r.roundNo} VOIDED (${reason}); refunded ${refunded.length} users`);
    const voided = await this.prisma.round.findUniqueOrThrow({ where: { id: r.id } });
    await this.recordResult(toRoundResult(voided));
    const ev: ServerEvent = {
      t: "round.settled",
      tableId: this.tableId,
      roundId: r.id,
      roundNo: Number(r.roundNo),
      winner: null,
      lockPrice: voided.lockPrice ? Number(voided.lockPrice.toString()) : null,
      closePrice: closePrice ?? null,
      poolBanker: Number(voided.poolBanker),
      poolPlayer: Number(voided.poolPlayer),
      payoutPerUnit: null,
      winners: 0,
      voidReason: reason,
    };
    await publish(this.redis, tableChannel(this.tableId, "round.settled"), ev);
    for (const userId of refunded) await this.publishBalance(userId, "refund");
    await this.redis.del(redisKeys.roundPools(r.id)).catch(() => undefined);
    return true;
  }

  // ---------------------------------------------------------------- helpers

  private async pools(roundId: string, tx: Pick<PrismaClient, "bet"> = this.prisma): Promise<Record<Side, bigint>> {
    const g = await tx.bet.groupBy({ by: ["side"], where: { roundId, cancelledAt: null }, _sum: { amount: true } });
    const out: Record<Side, bigint> = { BANKER: 0n, PLAYER: 0n };
    for (const row of g) out[row.side] = row._sum.amount ?? 0n;
    return out;
  }

  private async recordResult(res: RoundResult) {
    try {
      const k = redisKeys.tableResults(this.tableId);
      await this.redis.lpush(k, JSON.stringify(res));
      await this.redis.ltrim(k, 0, 499);
    } catch (e) {
      log.warn("engine", `result push failed: ${(e as Error).message}`);
    }
  }

  private async publishBalance(userId: string, reason: string) {
    try {
      const b = await this.prisma.balance.findUnique({ where: { userId_currency: { userId, currency: "COINS" } } });
      const ev: ServerEvent = { t: "user.balance", currency: "COINS", amount: Number(b?.amount ?? 0n), reason };
      await publish(this.redis, userChannel(userId, "balance"), ev);
    } catch (e) {
      log.warn("engine", `balance publish failed: ${(e as Error).message}`);
    }
  }

  private async publishState() {
    const live = await this.prisma.round.findMany({ where: { tableId: this.tableId, status: { in: ["BETTING", "LOCKED"] } } });
    const betting = live.find((r) => r.status === "BETTING");
    const locked = live.find((r) => r.status === "LOCKED");
    let bettingView = betting ? toRoundView(betting) : null;
    if (bettingView) {
      // overlay live pools (DB pools are only written at lock time)
      const h = await this.redis.hgetall(redisKeys.roundPools(bettingView.id)).catch(() => ({}) as Record<string, string>);
      if (h.BANKER !== undefined || h.PLAYER !== undefined) {
        bettingView = { ...bettingView, poolBanker: Number(h.BANKER ?? 0), poolPlayer: Number(h.PLAYER ?? 0) };
      }
    }
    const ev: ServerEvent = {
      t: "round.state",
      tableId: this.tableId,
      betting: bettingView,
      locked: locked ? toRoundView(locked) : null,
      serverTime: Date.now(),
    };
    try {
      await this.redis.set(redisKeys.tableState(this.tableId), JSON.stringify(ev), "EX", 120);
    } catch {
      /* ignore */
    }
    await publish(this.redis, tableChannel(this.tableId, "round.state"), ev);
  }
}
