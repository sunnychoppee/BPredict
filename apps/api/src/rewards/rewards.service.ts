import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import {
  nextRewardDayStart,
  prevRewardDay,
  rewardDay,
  supplyCharges,
  type ClaimResult,
  type EconomyParams,
  type RewardsView,
} from "@bpredict/shared";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import { EconomyService } from "../economy/economy.service";

type RewardsRow = NonNullable<Awaited<ReturnType<PrismaService["userRewards"]["findUnique"]>>>;
type UserRow = { isVip: boolean; vipExpiresAt: Date | null };

/**
 * Free coin sources (PRD §7.2): 7-day check-in, timed supply (energy-style regen),
 * relief pack when nearly broke, VIP daily coins. Every claim is a ledger post
 * with a deterministic idempotency key, so retries / double clicks cannot double-pay.
 */
@Injectable()
export class RewardsService {
  private readonly log = new Logger(RewardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly economy: EconomyService,
  ) {}

  // ---------- read ----------

  async view(userId: string): Promise<RewardsView> {
    const [row, user, params, balance] = await Promise.all([
      this.ensureRow(userId),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { isVip: true, vipExpiresAt: true } }),
      this.economy.get(),
      this.ledger.balance(userId, "COINS"),
    ]);
    return this.build(row, user, params, Number(balance), Date.now());
  }

  private build(row: RewardsRow, user: UserRow, p: EconomyParams, balance: number, now: number): RewardsView {
    const day = rewardDay(now);
    const yesterday = prevRewardDay(day);

    // Check-in: streak continues only if the last claim was yesterday; a claim today means done.
    const claimedToday = row.lastCheckinDay === day;
    const streak = claimedToday || row.lastCheckinDay === yesterday ? row.checkinStreak : 0;
    const nextIndex = claimedToday ? Math.max(0, streak - 1) : streak % p.daily_checkin.length;

    const supply = supplyCharges(row.supplyAnchorAt.getTime(), now, p.timed_supply_interval_h * 3600_000, p.timed_supply_max_stack);

    const reliefClaimed = row.lastReliefDay === day;
    const otherRewardsPending = !claimedToday || supply.charges > 0;
    const reliefReason: RewardsView["relief"]["reason"] = reliefClaimed
      ? "claimed"
      : balance >= p.relief_threshold
        ? "balance"
        : otherRewardsPending
          ? "other_rewards"
          : "ok";

    const isVip = this.vipActive(user, now);
    const vipClaimed = row.lastVipDailyDay === day;

    return {
      serverTime: now,
      day,
      dayEndsAt: nextRewardDayStart(now),
      checkin: {
        amounts: p.daily_checkin,
        streak,
        nextIndex,
        claimedToday,
        available: !claimedToday,
      },
      supply: {
        amount: p.timed_supply_amount,
        intervalH: p.timed_supply_interval_h,
        maxStack: p.timed_supply_max_stack,
        charges: supply.charges,
        nextAt: supply.nextAt,
      },
      relief: {
        amount: p.relief_amount,
        threshold: p.relief_threshold,
        available: reliefReason === "ok",
        claimedToday: reliefClaimed,
        reason: reliefReason,
      },
      vipDaily: {
        amount: p.vip_daily_coins,
        isVip,
        vipExpiresAt: user.vipExpiresAt?.toISOString() ?? null,
        available: isVip && !vipClaimed,
        claimedToday: vipClaimed,
      },
    };
  }

  private vipActive(user: UserRow, now: number): boolean {
    return user.isVip && (!user.vipExpiresAt || user.vipExpiresAt.getTime() > now);
  }

  private ensureRow(userId: string): Promise<RewardsRow> {
    return this.prisma.userRewards.upsert({ where: { userId }, create: { userId }, update: {} });
  }

  // ---------- claims ----------

  async checkin(userId: string): Promise<ClaimResult> {
    const p = await this.economy.get();
    const now = Date.now();
    const day = rewardDay(now);
    const yesterday = prevRewardDay(day);
    const row = await this.ensureRow(userId);
    if (row.lastCheckinDay === day) throw new BadRequestException("今日已簽到");

    const streakBefore = row.lastCheckinDay === yesterday ? row.checkinStreak : 0;
    const index = streakBefore % p.daily_checkin.length;
    const amount = p.daily_checkin[index]!;
    const streakAfter = index + 1;

    await this.prisma.$transaction(async (tx) => {
      // Optimistic guard against concurrent claims: only advance if the row is unchanged.
      const updated = await tx.userRewards.updateMany({
        where: { userId, lastCheckinDay: row.lastCheckinDay },
        data: { checkinStreak: streakAfter, lastCheckinDay: day },
      });
      if (updated.count !== 1) throw new BadRequestException("今日已簽到");
      await this.ledger.postIn(tx, {
        userId,
        currency: "COINS",
        amount,
        type: "DAILY_CHECKIN",
        idempotencyKey: `checkin:${userId}:${day}`,
        meta: { day, streak: streakAfter },
      });
    });
    return this.finish(userId, "DAILY_CHECKIN", amount, { streak: streakAfter });
  }

  async supply(userId: string): Promise<ClaimResult> {
    const p = await this.economy.get();
    const now = Date.now();
    const intervalMs = p.timed_supply_interval_h * 3600_000;
    const row = await this.ensureRow(userId);
    const anchor = row.supplyAnchorAt.getTime();
    const { charges } = supplyCharges(anchor, now, intervalMs, p.timed_supply_max_stack);
    if (charges < 1) throw new BadRequestException("補給尚未就緒");

    // Consume one charge: advance the anchor by one interval (clamped so stacking never exceeds max).
    const minAnchor = now - p.timed_supply_max_stack * intervalMs;
    const newAnchor = new Date(Math.max(anchor, minAnchor) + intervalMs);
    const amount = p.timed_supply_amount;

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.userRewards.updateMany({
        where: { userId, supplyAnchorAt: row.supplyAnchorAt },
        data: { supplyAnchorAt: newAnchor },
      });
      if (updated.count !== 1) throw new BadRequestException("請稍後再試");
      await this.ledger.postIn(tx, {
        userId,
        currency: "COINS",
        amount,
        type: "TIMED_SUPPLY",
        idempotencyKey: `supply:${userId}:${anchor}`,
        meta: { anchor },
      });
    });
    return this.finish(userId, "TIMED_SUPPLY", amount);
  }

  async relief(userId: string): Promise<ClaimResult> {
    const view = await this.view(userId);
    if (!view.relief.available) {
      const msg =
        view.relief.reason === "claimed"
          ? "今日已領取救濟金"
          : view.relief.reason === "balance"
            ? `餘額需低於 ${view.relief.threshold} 才能領取`
            : "請先領取簽到與補給獎勵";
      throw new BadRequestException(msg);
    }
    const amount = view.relief.amount;
    const day = view.day;
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.userRewards.updateMany({
        // NULL-safe "not claimed today" (plain NOT would skip rows where the column is NULL).
        where: { userId, OR: [{ lastReliefDay: null }, { lastReliefDay: { not: day } }] },
        data: { lastReliefDay: day },
      });
      if (updated.count !== 1) throw new BadRequestException("今日已領取救濟金");
      await this.ledger.postIn(tx, {
        userId,
        currency: "COINS",
        amount,
        type: "RELIEF",
        idempotencyKey: `relief:${userId}:${day}`,
        meta: { day },
      });
    });
    return this.finish(userId, "RELIEF", amount);
  }

  async vipDaily(userId: string): Promise<ClaimResult> {
    const view = await this.view(userId);
    if (!view.vipDaily.isVip) throw new BadRequestException("僅限 VIP 會員");
    if (view.vipDaily.claimedToday) throw new BadRequestException("今日已領取 VIP 金幣");
    const amount = view.vipDaily.amount;
    const day = view.day;
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.userRewards.updateMany({
        where: { userId, OR: [{ lastVipDailyDay: null }, { lastVipDailyDay: { not: day } }] },
        data: { lastVipDailyDay: day },
      });
      if (updated.count !== 1) throw new BadRequestException("今日已領取 VIP 金幣");
      await this.ledger.postIn(tx, {
        userId,
        currency: "COINS",
        amount,
        type: "VIP_DAILY",
        idempotencyKey: `vipdaily:${userId}:${day}`,
        meta: { day },
      });
    });
    return this.finish(userId, "VIP_DAILY", amount);
  }

  private async finish(userId: string, type: ClaimResult["type"], amount: number, extra: Partial<ClaimResult> = {}): Promise<ClaimResult> {
    await this.ledger.publishBalance(userId, "COINS", type.toLowerCase());
    const [balance, rewards] = await Promise.all([this.ledger.balance(userId, "COINS"), this.view(userId)]);
    this.log.log(`${type} user=${userId} +${amount}`);
    return { type, amount, balance: Number(balance), rewards, ...extra };
  }
}
