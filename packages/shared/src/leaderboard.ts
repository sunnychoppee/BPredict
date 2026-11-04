import { REWARD_TZ_OFFSET_MS, rewardDay } from "./rewards";

export type LeaderboardBoard = "profit" | "winrate" | "streak";
export type LeaderboardPeriod = "day" | "week" | "season";

export const LEADERBOARD_BOARDS: readonly LeaderboardBoard[] = ["profit", "winrate", "streak"];
export const LEADERBOARD_PERIODS: readonly LeaderboardPeriod[] = ["day", "week", "season"];

const DAY_MS = 86_400_000;

function dayToMs(day: string): number {
  return new Date(`${day}T00:00:00Z`).getTime() - REWARD_TZ_OFFSET_MS;
}
function msToDay(ms: number): string {
  return rewardDay(ms);
}

/** Inclusive day range [from, to] (UTC+8 calendar days) plus the epoch ms when the period ends. */
export interface PeriodRange {
  period: LeaderboardPeriod;
  from: string;
  to: string;
  endsAt: number;
  /** 1-based season number (season period only). */
  seasonNo?: number;
}

export function periodRange(period: LeaderboardPeriod, opts: { seasonStart: string; seasonDays: number }, nowMs = Date.now()): PeriodRange {
  const today = rewardDay(nowMs);
  const todayStart = dayToMs(today);
  if (period === "day") return { period, from: today, to: today, endsAt: todayStart + DAY_MS };
  if (period === "week") {
    // ISO week: Monday–Sunday in UTC+8.
    const dow = (new Date(todayStart + REWARD_TZ_OFFSET_MS).getUTCDay() + 6) % 7; // 0 = Monday
    const monday = todayStart - dow * DAY_MS;
    return { period, from: msToDay(monday), to: msToDay(monday + 6 * DAY_MS), endsAt: monday + 7 * DAY_MS };
  }
  const seasonStartMs = dayToMs(opts.seasonStart);
  const len = Math.max(1, opts.seasonDays) * DAY_MS;
  const idx = Math.max(0, Math.floor((todayStart - seasonStartMs) / len));
  const start = seasonStartMs + idx * len;
  return { period, from: msToDay(start), to: msToDay(start + len - DAY_MS), endsAt: start + len, seasonNo: idx + 1 };
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  isVip: boolean;
  /** profit: net coins; winrate: percentage 0–100 (1 decimal); streak: best streak. */
  value: number;
  rounds: number;
  wins: number;
}

export interface LeaderboardView {
  board: LeaderboardBoard;
  period: LeaderboardPeriod;
  range: PeriodRange;
  /** Win-rate board only: rounds required to be listed. */
  minRounds: number | null;
  generatedAt: number;
  entries: LeaderboardEntry[];
  /** The requesting user's own row (null when anonymous or not qualified). */
  me: (LeaderboardEntry & { qualified: boolean }) | null;
}

/** A settled round joined with the caller's own stake / payout. */
export interface MyRoundView {
  roundId: string;
  roundNo: number;
  tableId: string;
  closeAt: number;
  winner: "BANKER" | "PLAYER" | null;
  lockPrice: number | null;
  closePrice: number | null;
  side: "BANKER" | "PLAYER" | "MIXED";
  stake: number;
  payout: number;
  streakBonus: number;
  /** payout − stake */
  net: number;
}
