/** Business day for rewards: calendar date in UTC+8, formatted YYYY-MM-DD. */
export const REWARD_TZ_OFFSET_MS = 8 * 60 * 60 * 1000;

export function rewardDay(ms = Date.now()): string {
  return new Date(ms + REWARD_TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** Start of the next reward day (UTC+8 midnight) in epoch ms. */
export function nextRewardDayStart(ms = Date.now()): number {
  const d = new Date(ms + REWARD_TZ_OFFSET_MS);
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime() - REWARD_TZ_OFFSET_MS;
}

export function prevRewardDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Energy-style regeneration: how many charges are available given the anchor timestamp. */
export function supplyCharges(anchorMs: number, nowMs: number, intervalMs: number, maxStack: number): { charges: number; nextAt: number | null } {
  const elapsed = Math.max(0, nowMs - anchorMs);
  const charges = Math.min(maxStack, Math.floor(elapsed / intervalMs));
  const nextAt = charges >= maxStack ? null : anchorMs + (charges + 1) * intervalMs;
  return { charges, nextAt };
}

export interface RewardsView {
  serverTime: number;
  day: string;
  /** Resets at UTC+8 midnight. */
  dayEndsAt: number;
  checkin: {
    amounts: number[];
    /** Days already claimed in the current streak (0–7). */
    streak: number;
    /** Index (0-based) of the day that would be claimed next. */
    nextIndex: number;
    claimedToday: boolean;
    available: boolean;
  };
  supply: {
    amount: number;
    intervalH: number;
    maxStack: number;
    charges: number;
    nextAt: number | null;
  };
  relief: {
    amount: number;
    threshold: number;
    available: boolean;
    claimedToday: boolean;
    /** Why it's unavailable, when it is. */
    reason: "ok" | "balance" | "claimed" | "other_rewards";
  };
  vipDaily: {
    amount: number;
    isVip: boolean;
    vipExpiresAt: string | null;
    available: boolean;
    claimedToday: boolean;
  };
}

export interface ClaimResult {
  type: "DAILY_CHECKIN" | "TIMED_SUPPLY" | "RELIEF" | "VIP_DAILY";
  amount: number;
  balance: number;
  /** For check-in: the streak after claiming (1–7). */
  streak?: number;
  rewards: RewardsView;
}
