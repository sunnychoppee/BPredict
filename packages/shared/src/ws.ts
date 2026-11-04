import type { Side } from "./types";

/** Serialisable view of a round used in snapshots and events. Timestamps are epoch ms. */
export interface RoundView {
  id: string;
  roundNo: number;
  status: "SCHEDULED" | "BETTING" | "LOCKED" | "SETTLED" | "VOIDED";
  betStartAt: number;
  lockAt: number;
  closeAt: number;
  lockPrice: number | null;
  closePrice: number | null;
  poolBanker: number;
  poolPlayer: number;
  winner: Side | null;
  payoutPerUnit: number | null;
}

export interface RoundResult {
  roundNo: number;
  winner: Side | null; // null = voided
  lockPrice: number | null;
  closePrice: number | null;
  closeAt: number;
}

export interface TableSnapshot {
  tableId: string;
  serverTime: number;
  betting: RoundView | null;
  locked: RoundView | null;
  price: PriceTick | null;
  /** Last ~10 minutes of 1 s ticks, oldest first (for the chart). */
  ticks: PriceTick[];
  results: RoundResult[];
}

export interface UserStatsView {
  totalRounds: number;
  wins: number;
  currentStreak: number;
  maxStreak: number;
  netProfit: number;
}

/** Public, non-sensitive subset of economy params the client needs to render odds and limits. */
export interface EconomyPublic {
  feeRate: number;
  seedPerSide: number;
  minBet: number;
  maxBetNormal: number;
  maxBetVip: number;
  chips: readonly number[];
  streakBonus: { streak: number; rate: number }[];
  streakBonusCap: number;
  welcomePack: number;
}

export interface PriceTick {
  price: number;
  source: string;
  ts: number;
}

// ---- server → client ----

export type ServerEvent =
  | { t: "hello"; serverTime: number }
  | { t: "pong"; nonce: number; serverTime: number }
  | ({ t: "snapshot" } & TableSnapshot)
  | { t: "round.state"; tableId: string; betting: RoundView | null; locked: RoundView | null; serverTime: number }
  | { t: "pool.update"; tableId: string; roundId: string; poolBanker: number; poolPlayer: number }
  | { t: "price.tick"; tableId: string; price: number; source: string; ts: number }
  | { t: "round.locked"; tableId: string; roundId: string; roundNo: number; lockPrice: number; source: string }
  | {
      t: "round.settled";
      tableId: string;
      roundId: string;
      roundNo: number;
      winner: Side | null;
      lockPrice: number | null;
      closePrice: number | null;
      poolBanker: number;
      poolPlayer: number;
      payoutPerUnit: number | null;
      winners: number;
      voidReason?: string;
    }
  | { t: "user.balance"; currency: "COINS" | "GEMS"; amount: number; reason: string }
  | { t: "user.payout"; roundId: string; roundNo: number; stake: number; payout: number; streakBonus: number; won: boolean; streak: number }
  | { t: "announce"; kind: "big_bet" | "streak" | "dragon"; text: string; ts: number }
  | { t: "error"; message: string };

// ---- client → server ----

export type ClientEvent = { t: "ping"; nonce: number } | { t: "subscribe"; tableId: string };

// ---- Redis channel helpers (shared by api / worker / ws) ----

export const tableChannel = (tableId: string, event: string) => `table:${tableId}:${event}`;
export const userChannel = (userId: string, event: string) => `user:${userId}:${event}`;

export const redisKeys = {
  price: (symbol: string) => `price:${symbol}`,
  priceTicks: (symbol: string) => `price:${symbol}:ticks`,
  tableState: (tableId: string) => `table:${tableId}:state`,
  tableResults: (tableId: string) => `table:${tableId}:results`,
  roundPools: (roundId: string) => `round:${roundId}:pools`,
  schedulerLeader: "scheduler:leader",
};
