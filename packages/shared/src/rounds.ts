import { ROUND_SECONDS } from "./constants";

/** Round number = floor(epochSeconds / ROUND_SECONDS), aligned to the UTC wall clock. */
export function roundNoAt(ms: number, roundSeconds = ROUND_SECONDS): number {
  return Math.floor(ms / 1000 / roundSeconds);
}

export interface RoundTimes {
  betStartAt: Date;
  lockAt: Date;
  closeAt: Date;
}

/** Betting window is [betStartAt, lockAt); price-watch window is [lockAt, closeAt). */
export function roundTimes(roundNo: number, roundSeconds = ROUND_SECONDS): RoundTimes {
  const start = roundNo * roundSeconds * 1000;
  return {
    betStartAt: new Date(start),
    lockAt: new Date(start + roundSeconds * 1000),
    closeAt: new Date(start + 2 * roundSeconds * 1000),
  };
}

/** How long (ms) the engine waits for a fresh price past a deadline before voiding the round. */
export const PRICE_GRACE_MS = 60_000;
/** A price older than this is treated as unavailable. */
export const PRICE_STALE_MS = 15_000;
/** Primary source must be healthy this long before we switch back to it. */
export const PRICE_FAILBACK_MS = 30_000;
