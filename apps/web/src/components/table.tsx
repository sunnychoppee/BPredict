"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { CHIP_DENOMINATIONS, DEFAULT_ECONOMY, ROUND_SECONDS, liveOdds, type Side } from "@bpredict/shared";
import { Chip, ChipStack, CountdownRing, GoldButton, Panel, Pill, TugOfWar, fmt, fmtPx, mmss, sound } from "@bpredict/ui";
import { useMe } from "@/components/use-me";
import { RoadPanel } from "@/components/road-panel";
import { AnnounceTicker } from "@/components/announce-ticker";
import { PriceChartClient } from "@/components/price-chart-client";
import { ApiError } from "@/lib/api";
import { cancelBets, placeBet, useTable } from "@/lib/table-store";

function useNow(intervalMs = 250) {
  const now = useTable((s) => s.now);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now();
}

interface Flier {
  id: number;
  value: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export function Table() {
  const { me, loading, reload } = useMe();
  const t = useTable();
  const now = useNow();
  const tt = useTranslations("table");
  const tc = useTranslations("common");

  const chips = t.economy?.chips ?? CHIP_DENOMINATIONS;
  const [chip, setChip] = useState<number>(1000);
  const [busy, setBusy] = useState<string | null>(null);
  const [fliers, setFliers] = useState<Flier[]>([]);
  const chipRefs = useRef<Record<number, HTMLElement | null>>({});
  const areaRefs = useRef<Record<Side, HTMLElement | null>>({ BANKER: null, PLAYER: null });
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

  // last-5-seconds tick
  useEffect(() => {
    if (betting && secsLeft > 0 && secsLeft <= 5 && lastTickSec.current !== secsLeft) {
      lastTickSec.current = secsLeft;
      sound().play("tick");
    }
  }, [secsLeft, betting]);

  const fly = useCallback((value: number, side: Side) => {
    const from = chipRefs.current[value]?.getBoundingClientRect();
    const to = areaRefs.current[side]?.getBoundingClientRect();
    if (!from || !to) return;
    const id = Date.now() + Math.random();
    setFliers((f) => [...f, { id, value, from: { x: from.left + from.width / 2, y: from.top + from.height / 2 }, to: { x: to.left + to.width / 2, y: to.top + to.height * 0.7 } }]);
    setTimeout(() => setFliers((f) => f.filter((x) => x.id !== id)), 700);
  }, []);

  const fail = (e: unknown, fallback: string) => t.pushToast("error", e instanceof ApiError ? e.message : fallback);

  async function onBet(side: Side, amount = chip) {
    if (!betting) return;
    setBusy(side);
    try {
      sound().play("place");
      fly(amount, side);
      await placeBet(betting.id, side, amount);
      await t.refreshMyBets();
    } catch (e) {
      fail(e, tt("betFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function onRepeat() {
    if (!betting || !t.lastRoundBets.length) return;
    setBusy("repeat");
    try {
      for (const b of t.lastRoundBets) {
        sound().play("place");
        fly(chips.find((c) => c <= b.amount) ?? chips[0]!, b.side);
        await placeBet(betting.id, b.side, b.amount);
      }
      await t.refreshMyBets();
    } catch (e) {
      fail(e, tt("repeatFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function onDouble() {
    if (!betting) return;
    const cur: { side: Side; amount: number }[] = [];
    if (myBanker) cur.push({ side: "BANKER", amount: myBanker });
    if (myPlayer) cur.push({ side: "PLAYER", amount: myPlayer });
    if (!cur.length) return;
    setBusy("double");
    try {
      for (const b of cur) {
        sound().play("place");
        fly(chips.find((c) => c <= b.amount) ?? chips[0]!, b.side);
        await placeBet(betting.id, b.side, b.amount);
      }
      await t.refreshMyBets();
    } catch (e) {
      fail(e, tt("doubleFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function onCancel() {
    if (!betting) return;
    setBusy("cancel");
    try {
      sound().play("cancel");
      await cancelBets(betting.id);
      await t.refreshMyBets();
    } catch (e) {
      fail(e, tt("cancelFailed"));
    } finally {
      setBusy(null);
    }
  }

  const settled = t.settled;
  const winSide = settled?.ev.winner ?? null;

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      {/* ------------------------------------------------ table ------------------------------------------------ */}
      <Panel className="flex-1 p-3 sm:p-4">
        <AnnounceTicker />
        {/* phase header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[.3em] text-gold/80">{tt("subtitle")}</div>
            <div className="num mt-0.5 flex items-baseline gap-2 text-3xl text-cream">
              {fmtPx(t.price?.price)}
              {priceDelta != null && (
                <span className={`text-base ${priceDelta > 0 ? "text-banker" : priceDelta < 0 ? "text-player" : "text-void"}`}>
                  {priceDelta > 0 ? "▲" : priceDelta < 0 ? "▼" : "＝"} {fmtPx(Math.abs(priceDelta))}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-cream/60">
              {betting ? (
                <>
                  <Pill>{tc("round", { n: betting.roundNo })}</Pill>
                  <span>{tt("betting")}</span>
                  {me && t.myStreak >= 2 && <span className="rounded-full bg-gold/20 px-1.5 py-0.5 text-[10px] text-gold-bright">{tt("streak", { n: t.myStreak })}</span>}
                </>
              ) : (
                <span>{tt("waiting")}</span>
              )}
              {locked && <span className="num text-cream/50">{tt("prevLocked", { no: locked.roundNo, price: fmtPx(locked.lockPrice), t: mmss(lockedSecs) })}</span>}
            </div>
          </div>
          <CountdownRing secs={betting ? secsLeft : 0} total={ROUND_SECONDS} label={betting ? tt("countdown") : tt("wait")} tone={betting ? "gold" : "void"} />
        </div>

        {/* chart */}
        <div className="mt-2 rounded-lg border border-gold/20 bg-felt-dark/40 px-1 pt-1">
          <PriceChartClient ticks={t.ticks} lockPrice={locked?.lockPrice ?? null} height={120} />
        </div>

        {/* tug of war */}
        <TugOfWar className="mt-3" banker={betting?.poolBanker ?? 0} player={betting?.poolPlayer ?? 0} seed={seed} oddsBanker={odds.BANKER} oddsPlayer={odds.PLAYER} labels={{ bankerPool: tt("bankerPool"), playerPool: tt("playerPool") }} />

        {/* bet areas */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          {(["BANKER", "PLAYER"] as const).map((side) => {
            const isB = side === "BANKER";
            const mine = isB ? myBanker : myPlayer;
            const pool = isB ? (betting?.poolBanker ?? 0) : (betting?.poolPlayer ?? 0);
            const glow = settled && winSide === side && settled.payout?.won;
            return (
              <button
                key={side}
                ref={(el) => {
                  areaRefs.current[side] = el;
                }}
                onClick={() => void onBet(side)}
                disabled={!canBet}
                className={`relative flex min-h-[9.5rem] flex-col items-center justify-start rounded-2xl border-2 pt-4 transition active:scale-[.98] disabled:opacity-60 ${
                  isB ? "border-banker/70 bg-gradient-to-b from-banker/25 to-banker/10 text-banker hover:from-banker/35" : "border-player/70 bg-gradient-to-b from-player/25 to-player/10 text-player hover:from-player/35"
                } ${glow ? "animate-winglow" : ""}`}
              >
                <div className="font-display text-5xl leading-none drop-shadow-[0_2px_0_rgba(0,0,0,.4)]">{isB ? "莊" : "閒"}</div>
                <div className="mt-1 text-[10px] uppercase tracking-widest opacity-70">{isB ? tt("bankerSub") : tt("playerSub")}</div>
                <div className="num mt-2 text-xl text-cream">×{(isB ? odds.BANKER : odds.PLAYER).toFixed(2)}</div>
                <div className="num text-[11px] text-cream/60">{tt("pool", { n: fmt(pool) })}</div>
                {mine > 0 && (
                  <div className="absolute bottom-2 left-2 flex items-end gap-1.5">
                    <ChipStack amount={mine} chips={chips} size={24} />
                    <span className="num rounded-full border border-gold bg-felt-dark/85 px-2 py-0.5 text-[11px] text-gold-bright">{fmt(mine)}</span>
                  </div>
                )}
                {busy === side && <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/30 text-cream">…</div>}
              </button>
            );
          })}
        </div>

        {/* my stake line */}
        <div className="mt-2 flex items-center justify-between text-[11px] text-cream/70">
          <span>
            {tt("myStake")}
            <span className="text-banker">
              {tc("banker")} {fmt(myBanker)}
            </span>{" "}
            ·{" "}
            <span className="text-player">
              {tc("player")} {fmt(myPlayer)}
            </span>
          </span>
          {t.economy && <span className="text-cream/45">{tt("limits", { max: fmt(me?.user.isVip ? t.economy.maxBetVip : t.economy.maxBetNormal), fee: (feeRate * 100).toFixed(0) })}</span>}
        </div>

        {/* road (mobile only; desktop uses the right column) */}
        <div className="mt-3 lg:hidden">
          <RoadPanel results={t.results} variant="mobile" />
        </div>

        {/* chip tray */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          {chips.map((d) => (
            <span
              key={d}
              ref={(el) => {
                chipRefs.current[d] = el;
              }}
            >
              <Chip
                value={d}
                size={46}
                selected={chip === d}
                onClick={() => {
                  setChip(d);
                  sound().play("chip");
                }}
              />
            </span>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <GoldButton variant="outline" disabled={!canBet || !t.lastRoundBets.length} onClick={() => void onRepeat()}>
            {busy === "repeat" ? "…" : tt("repeat")}
          </GoldButton>
          <GoldButton variant="outline" disabled={!canBet || !t.myBets.length} onClick={() => void onDouble()}>
            {busy === "double" ? "…" : tt("double")}
          </GoldButton>
          <GoldButton variant="outline" disabled={!betting || !t.myBets.length || !!busy} onClick={() => void onCancel()}>
            {busy === "cancel" ? "…" : tt("undo")}
          </GoldButton>
        </div>

        {!me && !loading && (
          <div className="mt-3 text-center text-xs text-cream/60">
            <Link href="/login" className="underline">
              {tc("login")}
            </Link>
            {tt("loginHint", { n: fmt(t.economy?.welcomePack ?? DEFAULT_ECONOMY.welcome_pack) })}
          </div>
        )}

        {/* settled overlay */}
        <AnimatePresence>
          {settled && (
            <motion.div
              key={settled.ev.roundId}
              initial={{ opacity: 0, scale: 0.85, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className="pointer-events-none absolute inset-x-6 top-1/3 z-20"
              onClick={() => t.clearSettled()}
            >
              <SettledBanner settled={settled} />
            </motion.div>
          )}
        </AnimatePresence>
      </Panel>

      {/* ------------------------------------------------ desktop road ------------------------------------------------ */}
      <aside className="hidden w-80 shrink-0 lg:block">
        <RoadPanel results={t.results} variant="desktop" />
      </aside>

      {/* flying chips */}
      <AnimatePresence>
        {fliers.map((f) => (
          <motion.div
            key={f.id}
            className="pointer-events-none fixed z-50"
            initial={{ left: f.from.x - 16, top: f.from.y - 16, scale: 1, opacity: 1 }}
            animate={{ left: f.to.x - 16, top: f.to.y - 16, scale: 0.8, opacity: 0.9 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <Chip value={f.value} size={32} flat />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function SettledBanner({ settled }: { settled: NonNullable<ReturnType<typeof useTable.getState>["settled"]> }) {
  const tt = useTranslations("table");
  const tc = useTranslations("common");
  const { ev, payout } = settled;
  const tone = ev.winner === "BANKER" ? "banker" : ev.winner === "PLAYER" ? "player" : "void";
  const title = ev.winner === "BANKER" ? tt("bankerWins") : ev.winner === "PLAYER" ? tt("playerWins") : tt("tieRound");
  const bg = tone === "banker" ? "from-banker/90 to-[#7a1017]/95 border-banker" : tone === "player" ? "from-player/90 to-[#0f2d5e]/95 border-player" : "from-void/80 to-[#444]/95 border-void";
  return (
    <div className={`mx-auto max-w-xs rounded-2xl border-2 bg-gradient-to-b px-5 py-4 text-center text-cream shadow-[0_12px_40px_rgba(0,0,0,.6)] ${bg}`}>
      <div className="text-[10px] tracking-[.3em] text-cream/70">{tc("round", { n: ev.roundNo })}</div>
      <div className="font-display text-4xl leading-tight drop-shadow">{title}</div>
      <div className="num mt-1 text-xs text-cream/80">
        {fmtPx(ev.lockPrice)} → {fmtPx(ev.closePrice)}
        {ev.payoutPerUnit != null && <span className="ml-2">× {ev.payoutPerUnit.toFixed(2)}</span>}
      </div>
      {payout && (
        <div className={`num mt-2 rounded-lg px-3 py-1.5 text-lg ${payout.won ? "bg-gold text-felt-dark" : "bg-black/30 text-cream/80"}`}>
          {payout.won ? `+${fmt(payout.payout)}` : payout.payout === payout.stake ? tt("refund", { n: fmt(payout.stake) }) : `−${fmt(payout.stake)}`}
          {payout.won && payout.streak >= 2 && <span className="ml-2 text-xs">{tt("streak", { n: payout.streak })}</span>}
        </div>
      )}
    </div>
  );
}