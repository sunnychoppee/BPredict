"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CHIP_DENOMINATIONS, DEFAULT_ECONOMY, liveOdds, type Side } from "@bpredict/shared";
import { sound } from "@bpredict/ui";
import { useMe } from "@/components/use-me";
import { ApiError } from "@/lib/api";
import { cancelBets, placeBet, useTable } from "@/lib/table-store";
import { haptic } from "@/lib/telegram";

export function useNow(intervalMs = 250) {
  const now = useTable((s) => s.now);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now();
}

/** Optional visual hook fired right before each bet request (casino uses it to fly a chip). */
export type BetVisual = (amount: number, side: Side) => void;

/**
 * Everything the table needs that is not presentation: WS lifecycle, odds, my stakes, countdowns and the
 * bet / repeat / double / undo actions. Shared by `CasinoTable` (莊/閒) and `MarketTable` (漲/跌).
 */
export function useTableController(visual?: BetVisual) {
  const { me, loading, reload } = useMe();
  const t = useTable();
  const now = useNow();
  const tt = useTranslations("table");

  const chips = t.economy?.chips ?? CHIP_DENOMINATIONS;
  const [busy, setBusy] = useState<string | null>(null);
  const lastTickSec = useRef(-1);

  useEffect(() => {
    t.connect();
    void t.loadEconomy();
    return () => t.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (t.lastPayout) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.lastPayout]);

  const betting = t.betting;
  const locked = t.locked;
  const feeRate = t.economy?.feeRate ?? DEFAULT_ECONOMY.fee_rate;
  const seed = t.economy?.seedPerSide ?? DEFAULT_ECONOMY.seed_pool_per_side;
  const odds = useMemo(() => liveOdds(betting?.poolBanker ?? 0, betting?.poolPlayer ?? 0, { feeRate, seedPerSide: seed }), [betting?.poolBanker, betting?.poolPlayer, feeRate, seed]);

  const myBanker = t.myBets.filter((b) => b.side === "BANKER").reduce((s, b) => s + b.amount, 0);
  const myPlayer = t.myBets.filter((b) => b.side === "PLAYER").reduce((s, b) => s + b.amount, 0);
  const secsLeft = betting ? Math.max(0, Math.ceil((betting.lockAt - now) / 1000)) : 0;
  const lockedSecs = locked ? Math.max(0, Math.ceil((locked.closeAt - now) / 1000)) : 0;
  const canBet = !!me && !!betting && secsLeft > 3 && !busy;
  const priceDelta = locked?.lockPrice != null && t.price ? t.price.price - locked.lockPrice : null;
  const maxBet = me?.user.isVip ? (t.economy?.maxBetVip ?? DEFAULT_ECONOMY.max_bet_per_round_vip) : (t.economy?.maxBetNormal ?? DEFAULT_ECONOMY.max_bet_per_round_normal);

  // last-5-seconds tick
  useEffect(() => {
    if (betting && secsLeft > 0 && secsLeft <= 5 && lastTickSec.current !== secsLeft) {
      lastTickSec.current = secsLeft;
      sound().play("tick");
    }
  }, [secsLeft, betting]);

  const fail = (e: unknown, fallback: string) => t.pushToast("error", e instanceof ApiError ? e.message : fallback);

  async function bet(side: Side, amount: number) {
    if (!betting) return;
    setBusy(side);
    try {
      sound().play("place");
      haptic.impact("light");
      visual?.(amount, side);
      await placeBet(betting.id, side, amount);
      await t.refreshMyBets();
    } catch (e) {
      fail(e, tt("betFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function repeat() {
    if (!betting || !t.lastRoundBets.length) return;
    setBusy("repeat");
    try {
      for (const b of t.lastRoundBets) {
        sound().play("place");
        visual?.(b.amount, b.side);
        await placeBet(betting.id, b.side, b.amount);
      }
      await t.refreshMyBets();
    } catch (e) {
      fail(e, tt("repeatFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function double() {
    if (!betting) return;
    const cur: { side: Side; amount: number }[] = [];
    if (myBanker) cur.push({ side: "BANKER", amount: myBanker });
    if (myPlayer) cur.push({ side: "PLAYER", amount: myPlayer });
    if (!cur.length) return;
    setBusy("double");
    try {
      for (const b of cur) {
        sound().play("place");
        visual?.(b.amount, b.side);
        await placeBet(betting.id, b.side, b.amount);
      }
      await t.refreshMyBets();
    } catch (e) {
      fail(e, tt("doubleFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function cancel(scope: "last" | "all") {
    if (!betting) return;
    setBusy(scope === "last" ? "cancel" : "clear");
    try {
      sound().play("cancel");
      await cancelBets(betting.id, scope);
      await t.refreshMyBets();
    } catch (e) {
      fail(e, tt("cancelFailed"));
    } finally {
      setBusy(null);
    }
  }

  return {
    me,
    loading,
    t,
    now,
    chips,
    busy,
    betting,
    locked,
    feeRate,
    seed,
    odds,
    myBanker,
    myPlayer,
    secsLeft,
    lockedSecs,
    canBet,
    priceDelta,
    maxBet,
    settled: t.settled,
    winSide: t.settled?.ev.winner ?? null,
    bet,
    repeat,
    double,
    cancel,
  };
}

export type TableController = ReturnType<typeof useTableController>;
