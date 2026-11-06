"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { DEFAULT_ECONOMY, ROUND_SECONDS, type RoundResult, type Side } from "@bpredict/shared";
import { fmt, fmtPx, mmss, sound } from "@bpredict/ui";
import { AnnounceTicker } from "@/components/announce-ticker";
import { PriceChartClient } from "@/components/price-chart-client";
import { useTableController } from "@/components/table-controller";
import type { useTable } from "@/lib/table-store";

const PRESETS = [100, 500, 1000, 5000] as const;
const RECENT = 12;

const short = (n: number) => (n >= 1000 ? `${n / 1000}K` : String(n));

/** 簡約漲跌 skin: price card, sentiment bar, amount picker, 買漲 / 買跌, recent strip. No roadmap, no chips. */
export function MarketTable() {
  const tt = useTranslations("table");
  const tc = useTranslations("common");
  const c = useTableController();
  const { me, loading, t, busy, betting, locked, feeRate, seed, odds, myBanker, myPlayer, secsLeft, lockedSecs, canBet, priceDelta, maxBet, settled } = c;

  const minBet = t.economy?.minBet ?? DEFAULT_ECONOMY.min_bet;
  const coins = t.coins ?? 0;
  const myTotal = myBanker + myPlayer;
  const maxNow = Math.max(0, Math.min(coins, maxBet - myTotal));

  const [preset, setPreset] = useState<number | "max" | "custom">(1000);
  const [custom, setCustom] = useState("");
  const amount = preset === "max" ? maxNow : preset === "custom" ? Math.floor(Number(custom.replace(/[^\d]/g, "")) || 0) : preset;
  const amountOk = amount >= minBet && amount <= maxNow;

  // Price change vs the price being decided (the locked round), as the market card's headline delta.
  const ref = locked?.lockPrice ?? null;
  const pct = priceDelta != null && ref ? (priceDelta / ref) * 100 : null;
  const last = t.results[t.results.length - 1];
  const streak = useMemo(() => runLength(t.results), [t.results]);

  const expected = Math.round(myBanker * odds.BANKER + myPlayer * odds.PLAYER);
  const phaseFrac = betting ? 1 - secsLeft / ROUND_SECONDS : 1;

  // Keep the custom field in sync when switching back to presets.
  useEffect(() => {
    if (preset !== "custom") setCustom("");
  }, [preset]);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      {/* ------------------------------------------------ left: market ------------------------------------------------ */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <AnnounceTicker />

        {/* price card */}
        <section className="felt-surface gold-frame rounded-[var(--radius-panel)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[.08em] text-cream/55">{tt("subtitle")}</div>
              <PriceBig price={t.price?.price} />
            </div>
            <div className="shrink-0 text-right">
              {priceDelta != null ? (
                <span className={`num inline-block rounded-lg px-2 py-1 text-[13px] font-bold ${priceDelta > 0 ? "bg-banker/10 text-banker" : priceDelta < 0 ? "bg-player/10 text-player" : "bg-void/15 text-void"}`}>
                  {priceDelta > 0 ? "▲ +" : priceDelta < 0 ? "▼ −" : "= "}
                  {fmtPx(Math.abs(priceDelta))}
                  {pct != null && <span className="ml-1 font-semibold opacity-80">({Math.abs(pct).toFixed(2)}%)</span>}
                </span>
              ) : (
                <span className="inline-block rounded-lg bg-void/15 px-2 py-1 text-[12px] text-cream/50">{tt("waiting")}</span>
              )}
              <div className="mt-1.5 text-[12px] text-cream/55">
                {betting && (
                  <>
                    <b className="num font-semibold text-cream">{tc("round", { n: betting.roundNo })}</b>
                    {last && (
                      <>
                        {" · "}
                        <span className={last.winner === "BANKER" ? "text-banker" : last.winner === "PLAYER" ? "text-player" : "text-void"}>{last.winner === "BANKER" ? `▲ ${tc("banker")}` : last.winner === "PLAYER" ? `▼ ${tc("player")}` : tc("tie")}</span>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-cream/5 bg-gradient-to-b from-felt-dark/60 to-felt px-1 pt-1">
            <PriceChartClient ticks={t.ticks} lockPrice={locked?.lockPrice ?? null} lockLabel={tt("lockLine")} height={132} palette="fresh" />
          </div>

          {/* phase progress */}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-cream/5">
            <div className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${betting ? (secsLeft <= 10 ? "bg-player" : "bg-gradient-to-r from-gold to-gold/70") : "bg-void/40"}`} style={{ width: `${Math.round(phaseFrac * 100)}%` }} />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[12px] text-cream/60">
            <span>{betting ? tt("countdown") : locked ? tt("settling") : tt("waiting")}</span>
            <b className={`num text-[13px] ${betting ? (secsLeft <= 10 ? "text-player" : "text-gold") : "text-cream/40"}`}>{betting ? mmss(secsLeft) : locked ? mmss(lockedSecs) : "--:--"}</b>
          </div>
          {locked && betting && <div className="num mt-0.5 text-[11px] text-cream/40">{tt("prevLocked", { no: locked.roundNo, price: fmtPx(locked.lockPrice), t: mmss(lockedSecs) })}</div>}
        </section>

        {/* sentiment */}
        <Sentiment banker={betting?.poolBanker ?? 0} player={betting?.poolPlayer ?? 0} seed={seed} odds={odds} />
      </div>

      {/* ------------------------------------------------ right: order panel ------------------------------------------------ */}
      <div className="flex w-full shrink-0 flex-col gap-3 lg:sticky lg:top-20 lg:w-[22rem]">
        <section className="felt-surface gold-frame rounded-[var(--radius-panel)] p-4">
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-semibold text-cream/70">{tt("amount")}</span>
            <span className="text-cream/40">{tt("limits", { max: fmt(maxBet), fee: (feeRate * 100).toFixed(0) })}</span>
          </div>
          <div className="mt-2 grid grid-cols-5 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setPreset(p);
                  sound().play("click");
                }}
                className={`num rounded-xl border py-2 text-[13px] transition ${preset === p ? "border-gold bg-gold/10 text-gold-bright" : "border-cream/10 bg-felt text-cream hover:border-cream/25"}`}
              >
                {short(p)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setPreset("max");
                sound().play("click");
              }}
              className={`rounded-xl border py-2 text-[13px] font-semibold transition ${preset === "max" ? "border-gold bg-gold/10 text-gold-bright" : "border-cream/10 bg-felt text-cream hover:border-cream/25"}`}
            >
              {tt("max")}
            </button>
          </div>
          <label className={`mt-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px] ${preset === "custom" ? "border-gold bg-gold/5" : "border-cream/10 bg-felt-dark/60"}`}>
            <span className="text-cream/45">{tt("custom")}</span>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              className="num min-w-0 flex-1 bg-transparent text-right text-cream outline-none placeholder:text-cream/30"
              placeholder={fmt(amount)}
              value={custom}
              onFocus={() => setPreset("custom")}
              onChange={(e) => {
                setPreset("custom");
                setCustom(e.target.value.replace(/[^\d]/g, ""));
              }}
            />
          </label>
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12px] text-cream/60">
            <span>
              {tt("myStake")}
              <b className="num text-banker">
                {tc("banker")} {fmt(myBanker)}
              </b>{" "}
              ·{" "}
              <b className="num text-player">
                {tc("player")} {fmt(myPlayer)}
              </b>
            </span>
            {myTotal > 0 && (
              <span>
                {tt("expected")} <b className="num text-cream">{fmt(expected)}</b>
              </span>
            )}
          </div>
        </section>

        {/* buy up / down */}
        <div className="grid grid-cols-2 gap-3">
          {(["BANKER", "PLAYER"] as const).map((side) => {
            const up = side === "BANKER";
            const mine = up ? myBanker : myPlayer;
            const won = settled && settled.ev.winner === side && settled.payout?.won;
            return (
              <button
                key={side}
                type="button"
                disabled={!canBet || !amountOk}
                onClick={() => void c.bet(side, amount)}
                className={`relative flex h-[4.75rem] flex-col items-center justify-center rounded-[1.125rem] text-white shadow-[0_8px_20px_rgba(0,0,0,.12)] transition active:scale-[.98] disabled:opacity-50 disabled:shadow-none ${
                  up ? "bg-gradient-to-b from-[#22C55E] to-[#15803D]" : "bg-gradient-to-b from-[#F87171] to-[#DC2626]"
                } ${won ? "animate-winglow" : ""}`}
              >
                <span className="num absolute right-2.5 top-2 rounded-full bg-white/20 px-1.5 py-0.5 text-[11px] font-bold">×{(up ? odds.BANKER : odds.PLAYER).toFixed(2)}</span>
                <span className="text-[20px] font-extrabold tracking-wide">{up ? `▲ ${tt("buyUp")}` : `▼ ${tt("buyDown")}`}</span>
                <span className="mt-0.5 text-[11px] font-medium opacity-90">{mine > 0 ? `${tt("pool", { n: fmt(mine) })}` : up ? tt("bankerSub") : tt("playerSub")}</span>
                {busy === side && <span className="absolute inset-0 flex items-center justify-center rounded-[1.125rem] bg-black/20">…</span>}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 text-[12px]">
          <SmallAction disabled={!betting || !t.myBets.length || !!busy} onClick={() => void c.cancel("last")} label={busy === "cancel" ? "…" : `↶ ${tt("undo")}`} />
          <SmallAction disabled={!betting || !t.myBets.length || !!busy} onClick={() => void c.cancel("all")} label={busy === "clear" ? "…" : `✕ ${tt("clear")}`} />
          <SmallAction disabled={!canBet || !t.lastRoundBets.length} onClick={() => void c.repeat()} label={busy === "repeat" ? "…" : `⟳ ${tt("repeat")}`} />
          <SmallAction disabled={!canBet || !t.myBets.length} onClick={() => void c.double()} label={busy === "double" ? "…" : `×2 ${tt("double")}`} />
        </div>

        {!me && !loading && (
          <div className="text-center text-xs text-cream/60">
            <Link href="/login" className="font-semibold text-gold underline">
              {tc("login")}
            </Link>
            {tt("loginHint", { n: fmt(t.economy?.welcomePack ?? DEFAULT_ECONOMY.welcome_pack) })}
          </div>
        )}
        {me && !amountOk && betting && <div className="text-center text-[11px] text-player">{amount > maxNow ? tt("limits", { max: fmt(maxNow), fee: (feeRate * 100).toFixed(0) }) : tt("limits", { max: fmt(maxBet), fee: (feeRate * 100).toFixed(0) })}</div>}

        <RecentStrip results={t.results} streak={streak} betting={!!betting} />
      </div>

      {/* settled card */}
      <AnimatePresence>
        {settled && (
          <motion.div key={settled.ev.roundId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 flex items-start justify-center bg-cream/35 px-6 backdrop-blur-[2px]" style={{ paddingTop: "calc(var(--safe-top) + 22vh)" }} onClick={() => t.clearSettled()}>
            <motion.div initial={{ scale: 0.9, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }} transition={{ type: "spring", stiffness: 260, damping: 22 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-xs">
              <SettledCard settled={settled} nextSecs={betting ? secsLeft : null} onClose={() => t.clearSettled()} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PriceBig({ price }: { price: number | undefined }) {
  if (price == null) return <div className="num mt-0.5 text-[30px] font-extrabold leading-none text-cream/30">—</div>;
  const [int, dec] = fmtPx(price).split(".");
  return (
    <div className="num mt-0.5 text-[30px] font-extrabold leading-none tracking-tight text-cream">
      {int}
      <span className="text-[20px] text-cream/50">.{dec}</span>
    </div>
  );
}

function Sentiment({ banker, player, seed, odds }: { banker: number; player: number; seed: number; odds: Record<Side, number> }) {
  const tt = useTranslations("table");
  const tc = useTranslations("common");
  const b = banker + seed;
  const p = player + seed;
  const pct = b + p > 0 ? Math.round((b / (b + p)) * 100) : 50;
  return (
    <section className="felt-surface gold-frame rounded-[var(--radius-panel)] p-4">
      <div className="flex items-center justify-between text-[12px]">
        <span className="font-semibold text-cream/70">{tt("sentiment")}</span>
        <span className="num text-cream/45">{tt("totalPool", { n: fmt(banker + player) })}</span>
      </div>
      <div className="mt-2.5 flex h-3 overflow-hidden rounded-full bg-player/15">
        <div className="h-full rounded-full bg-gradient-to-r from-[#22C55E] to-[#16A34A] transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[12px]">
        <span className="font-bold text-banker">
          ▲ {tc("banker")} {pct}%<small className="ml-1 font-medium text-cream/50">×{odds.BANKER.toFixed(2)}</small>
        </span>
        <span className="font-bold text-player">
          <small className="mr-1 font-medium text-cream/50">×{odds.PLAYER.toFixed(2)}</small>
          {100 - pct}% {tc("player")} ▼
        </span>
      </div>
    </section>
  );
}

function runLength(results: RoundResult[]): { side: Side; n: number } | null {
  const lastSide = results[results.length - 1]?.winner;
  if (!lastSide) return null;
  let n = 0;
  for (let i = results.length - 1; i >= 0 && results[i]!.winner === lastSide; i--) n++;
  return n >= 2 ? { side: lastSide, n } : null;
}

function RecentStrip({ results, streak, betting }: { results: RoundResult[]; streak: { side: Side; n: number } | null; betting: boolean }) {
  const tt = useTranslations("table");
  const recent = results.slice(-RECENT);
  return (
    <section className="felt-surface gold-frame rounded-[var(--radius-panel)] px-4 py-3">
      <div className="flex items-center justify-between text-[12px]">
        <span className="font-semibold text-cream/70">{tt("recent", { n: RECENT })}</span>
        <span className="flex items-center gap-2">
          {streak && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${streak.side === "BANKER" ? "bg-banker/10 text-banker" : "bg-player/10 text-player"}`}>{streak.side === "BANKER" ? tt("streakUp", { n: streak.n }) : tt("streakDown", { n: streak.n })}</span>}
          <Link href="/history" className="text-cream/40 hover:text-gold">
            {tt("myHistory")} →
          </Link>
        </span>
      </div>
      <div className="mt-2 flex flex-nowrap items-center gap-1 overflow-hidden">
        {recent.map((r) => (
          <span key={r.roundNo} title={`#${r.roundNo} ${fmtPx(r.lockPrice)} → ${fmtPx(r.closePrice)}`} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold text-white ${r.winner === "BANKER" ? "bg-banker" : r.winner === "PLAYER" ? "bg-player" : "bg-void"}`}>
            {r.winner === "BANKER" ? "▲" : r.winner === "PLAYER" ? "▼" : "="}
          </span>
        ))}
        {betting && <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-gold text-[10px] text-gold">?</span>}
        {!recent.length && <span className="text-[12px] text-cream/40">—</span>}
      </div>
    </section>
  );
}

function SmallAction({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="rounded-full border border-cream/10 bg-felt px-3 py-1.5 text-cream/70 transition hover:border-cream/25 hover:text-cream disabled:opacity-40">
      {label}
    </button>
  );
}

function SettledCard({ settled, nextSecs, onClose }: { settled: NonNullable<ReturnType<typeof useTable.getState>["settled"]>; nextSecs: number | null; onClose: () => void }) {
  const tt = useTranslations("table");
  const { ev, payout } = settled;
  const up = ev.winner === "BANKER";
  const down = ev.winner === "PLAYER";
  const title = up ? `▲ ${tt("bankerWins")}` : down ? `▼ ${tt("playerWins")}` : tt("tieRound");
  const won = payout?.won;
  return (
    <div className="rounded-3xl bg-felt px-5 py-6 text-center shadow-[0_30px_60px_rgba(0,0,0,.25)]">
      <div className="text-[11px] uppercase tracking-[.08em] text-cream/50">{tt("settledTitle", { n: ev.roundNo })}</div>
      <div className={`mt-1.5 text-[34px] font-black leading-none ${up ? "text-banker" : down ? "text-player" : "text-void"}`}>{title}</div>
      <div className="num mt-2 text-[13px] text-cream/60">
        {fmtPx(ev.lockPrice)} → {fmtPx(ev.closePrice)}
        {ev.payoutPerUnit != null && <span className="ml-2 text-cream">×{ev.payoutPerUnit.toFixed(2)}</span>}
      </div>
      {payout && (
        <div className={`num mt-4 inline-block rounded-2xl px-6 py-2 text-[26px] font-black ${won ? "bg-banker/10 text-banker" : payout.payout === payout.stake ? "bg-void/15 text-cream/70" : "bg-player/10 text-player"}`}>
          {won ? `+${fmt(payout.payout)}` : payout.payout === payout.stake ? tt("refund", { n: fmt(payout.stake) }) : `−${fmt(payout.stake)}`}
        </div>
      )}
      {payout?.won && payout.streak >= 2 && <div className="mt-2.5 text-[12px] font-bold text-[#D97706]">{tt("streak", { n: payout.streak })}</div>}
      <button type="button" onClick={onClose} className="mt-4 w-full rounded-xl bg-gold py-3 text-[14px] font-bold text-white transition hover:bg-gold-bright">
        {nextSecs != null ? tt("nextRound", { t: mmss(nextSecs) }) : tt("nextRoundSoon")}
      </button>
    </div>
  );
}
