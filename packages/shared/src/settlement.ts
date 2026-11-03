import type { Side } from "./types";

export interface StreakTier {
  streak: number;
  rate: number;
}

export interface SettlementParams {
  /** Table fee rate, e.g. 0.04 */
  feeRate: number;
  /** Virtual seed pool per side (not owned by anyone). */
  seedPerSide: number;
  streakBonus: StreakTier[];
  /** Max streak bonus per user per round. */
  streakBonusCap: number;
}

export interface StakeInput {
  userId: string;
  side: Side;
  amount: number;
  /** Consecutive wins *before* this round. */
  currentStreak: number;
}

export interface UserPayout {
  userId: string;
  side: Side;
  stake: number;
  base: number;
  streakBonus: number;
  total: number;
}

export interface SettlementResult {
  winner: Side;
  poolBanker: number;
  poolPlayer: number;
  fee: number;
  /** Coins each winning coin returns, before rounding (e.g. 1.92). */
  payoutPerUnit: number;
  payouts: UserPayout[];
  /** fee + seed share + rounding dust - streak bonuses actually paid. */
  destroyed: number;
}

/**
 * Pari-mutuel settlement with a virtual seed pool (PRD §4.3, TECH_DESIGN §5.4).
 *
 *   payoutPerUnit = ((B + P) × (1 − f) + S) / (W + S)
 *
 * The seed's own share of the payout is destroyed. Streak bonuses are paid out of `fee`
 * (never minted), capped per user and in total by the fee.
 */
export function computeSettlement(
  winner: Side,
  stakes: readonly StakeInput[],
  params: SettlementParams,
): SettlementResult {
  const perUser = new Map<string, { side: Side; stake: number; streak: number }>();
  let B = 0;
  let P = 0;
  for (const s of stakes) {
    if (!Number.isInteger(s.amount) || s.amount <= 0) throw new Error("stake must be a positive integer");
    if (s.side === "BANKER") B += s.amount;
    else P += s.amount;
    const key = `${s.userId}:${s.side}`;
    const cur = perUser.get(key);
    if (cur) cur.stake += s.amount;
    else perUser.set(key, { side: s.side, stake: s.amount, streak: s.currentStreak });
  }

  const S = params.seedPerSide;
  const W = winner === "BANKER" ? B : P;
  const fee = Math.floor((B + P) * params.feeRate);
  const distributable = B + P - fee + S;
  const payoutPerUnit = W + S > 0 ? distributable / (W + S) : 0;

  const payouts: UserPayout[] = [];
  let paidBase = 0;
  let bonusBudget = fee;
  let paidBonus = 0;

  for (const [key, u] of perUser) {
    if (u.side !== winner) continue;
    const userId = key.slice(0, key.lastIndexOf(":"));
    const base = Math.floor(u.stake * payoutPerUnit);
    const profit = Math.max(0, base - u.stake);
    const rate = streakRate(u.streak + 1, params.streakBonus);
    let bonus = Math.min(Math.floor(profit * rate), params.streakBonusCap, bonusBudget);
    if (bonus < 0) bonus = 0;
    bonusBudget -= bonus;
    paidBase += base;
    paidBonus += bonus;
    payouts.push({ userId, side: u.side, stake: u.stake, base, streakBonus: bonus, total: base + bonus });
  }

  // Everything that entered the round (real stakes + seed) minus what left it.
  const destroyed = B + P + S - paidBase - paidBonus;

  return { winner, poolBanker: B, poolPlayer: P, fee, payoutPerUnit, payouts, destroyed };
}

/** Bonus rate for a streak length *including* the current win. Highest qualifying tier wins. */
export function streakRate(streakIncludingThis: number, tiers: readonly StreakTier[]): number {
  let rate = 0;
  for (const t of tiers) if (streakIncludingThis >= t.streak && t.rate > rate) rate = t.rate;
  return rate;
}

/** Live odds shown while betting: what 1 coin on `side` would return if it won right now. */
export function liveOdds(poolBanker: number, poolPlayer: number, params: Pick<SettlementParams, "feeRate" | "seedPerSide">) {
  const S = params.seedPerSide;
  const dist = (poolBanker + poolPlayer) * (1 - params.feeRate) + S;
  return {
    BANKER: (dist + 1 - params.feeRate) / (poolBanker + S + 1),
    PLAYER: (dist + 1 - params.feeRate) / (poolPlayer + S + 1),
  };
}
