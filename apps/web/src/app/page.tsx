"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CHIP_DENOMINATIONS, DEFAULT_ECONOMY, liveOdds, type RoundView, type Side } from "@bpredict/shared";
import { TelegramAutoLogin } from "@/components/telegram-auto-login";
import { BeadRoad, RoadStats } from "@/components/road";
import { Toasts } from "@/components/toasts";
import { useMe } from "@/components/use-me";
import { ApiError, logout } from "@/lib/api";
import { cancelBets, myBets, placeBet, useTable, type MyBet } from "@/lib/table-store";

const fmt = (n: number) => n.toLocaleString("en-US");
const fmtPx = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const chipLabel = (d: number) => (d >= 1000 ? `${d / 1000}k` : String(d));

function useNow(intervalMs = 250) {
  const now = useTable((s) => s.now);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now();
}

export default function TablePage() {
  const { me, loading, reload } = useMe();
  const t = useTable();
  const now = useNow();

  const [chip, setChip] = useState<number>(CHIP_DENOMINATIONS[2] ?? 1000);
  const [mine, setMine] = useState<MyBet[]>([]);
  const [busy, setBusy] = useState<Side | "cancel" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    t.connect();
    return () => t.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // seed coins from /me, then WS keeps it fresh
  useEffect(() => {
    if (me) t.setCoins(me.balances.find((b) => b.currency === "COINS")?.amount ?? 0);
    else if (!loading) t.setCoins(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, loading]);

  const betting = t.betting;
  const locked = t.locked;
  const bettingId = betting?.id;

  const refreshMine = useCallback(async () => {
    if (!bettingId || !me) return setMine([]);
    try {
      setMine(await myBets(bettingId));
    } catch {
      setMine([]);
    }
  }, [bettingId, me]);

  useEffect(() => {
    void refreshMine();
  }, [refreshMine]);

  // when my last payout arrives, also refresh /me-driven data lazily
  useEffect(() => {
    if (t.lastPayout) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.lastPayout]);

  const odds = useMemo(
    () => liveOdds(betting?.poolBanker ?? 0, betting?.poolPlayer ?? 0, { feeRate: DEFAULT_ECONOMY.fee_rate, seedPerSide: DEFAULT_ECONOMY.seed_pool_per_side }),
    [betting?.poolBanker, betting?.poolPlayer],
  );

  const myBanker = mine.filter((b) => b.side === "BANKER").reduce((s, b) => s + b.amount, 0);
  const myPlayer = mine.filter((b) => b.side === "PLAYER").reduce((s, b) => s + b.amount, 0);
  const secsLeft = betting ? Math.max(0, Math.ceil((betting.lockAt - now) / 1000)) : 0;
  const lockedSecs = locked ? Math.max(0, Math.ceil((locked.closeAt - now) / 1000)) : 0;
  const canBet = !!me && !!betting && secsLeft > 3 && !busy;

  const priceDelta = locked?.lockPrice != null && t.price ? t.price.price - locked.lockPrice : null;

  async function onBet(side: Side) {
    if (!betting) return;
    setBusy(side);
    setErr(null);
    try {
      await placeBet(betting.id, side, chip);
      await refreshMine();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "下注失敗");
    } finally {
      setBusy(null);
    }
  }

  async function onCancel() {
    if (!betting) return;
    setBusy("cancel");
    setErr(null);
    try {
      await cancelBets(betting.id);
      await refreshMine();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "取消失敗");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="flex min-h-screen flex-col" style={{ paddingTop: "var(--safe-top)" }}>
      <TelegramAutoLogin />
      <Toasts />

      {/* header */}
      <header className="flex items-center justify-between border-b border-gold/30 bg-felt-dark px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="font-display text-lg tracking-wide text-gold">莊閒 · BTC</span>
          <span className={`h-1.5 w-1.5 rounded-full ${t.connected ? "bg-emerald-400" : "bg-banker animate-pulse"}`} title={t.connected ? "已連線" : "連線中"} />
        </div>
        {me ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="num text-gold-bright">🪙 {fmt(t.coins ?? 0)}</span>
            <span className="max-w-[6rem] truncate text-cream/70">{me.user.nickname}</span>
          </div>
        ) : loading ? (
          <span className="text-sm text-cream/50">…</span>
        ) : (
          <Link href="/login" className="btn-gold text-sm">
            登入
          </Link>
        )}
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 p-3 sm:max-w-5xl sm:flex-row sm:items-start">
        {/* ---------- table ---------- */}
        <section className="felt-surface gold-frame relative flex-1 rounded-2xl p-3 shadow-inset sm:p-4">
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-vignette" />
          <div className="relative flex flex-col gap-3">
            {/* price strip */}
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[.3em] text-gold/80">BTC / USDT · 5 分鐘一局</div>
                <div className="num text-3xl text-cream">
                  {fmtPx(t.price?.price)}
                  {priceDelta != null && (
                    <span className={`ml-2 text-base ${priceDelta > 0 ? "text-banker" : priceDelta < 0 ? "text-player" : "text-void"}`}>
                      {priceDelta > 0 ? "▲" : priceDelta < 0 ? "▼" : "＝"} {fmtPx(Math.abs(priceDelta))}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-cream/40">來源 {t.price?.source ?? "—"}</div>
              </div>
              <Countdown betting={betting} secsLeft={secsLeft} />
            </div>

            {/* locked round (結算中) */}
            {locked && (
              <div className="flex items-center justify-between rounded-lg border border-gold/30 bg-felt-dark/60 px-3 py-2 text-xs">
                <span className="text-cream/70">
                  上一局 #{locked.roundNo} <span className="text-gold-bright">結算中</span>
                </span>
                <span className="num text-cream/80">
                  鎖定 {fmtPx(locked.lockPrice)} · 莊 {fmt(locked.poolBanker)} / 閒 {fmt(locked.poolPlayer)}
                </span>
                <span className="num text-gold-bright">{Math.floor(lockedSecs / 60)}:{String(lockedSecs % 60).padStart(2, "0")}</span>
              </div>
            )}

            {/* bet areas */}
            <div className="grid grid-cols-2 gap-3">
              <BetArea side="BANKER" view={betting} odds={odds.BANKER} mine={myBanker} disabled={!canBet} busy={busy === "BANKER"} onClick={() => void onBet("BANKER")} />
              <BetArea side="PLAYER" view={betting} odds={odds.PLAYER} mine={myPlayer} disabled={!canBet} busy={busy === "PLAYER"} onClick={() => void onBet("PLAYER")} />
            </div>

            {/* chips */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {CHIP_DENOMINATIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setChip(d)}
                    className={`num flex h-11 w-11 items-center justify-center rounded-full border-2 text-xs transition ${
                      chip === d ? "scale-110 border-gold-bright bg-gold text-felt-dark shadow-[0_0_12px_rgba(232,201,122,.6)]" : "border-dashed border-gold/60 bg-felt-dark/60 text-gold-bright"
                    }`}
                  >
                    {chipLabel(d)}
                  </button>
                ))}
              </div>
              <button className="btn-outline whitespace-nowrap text-xs" disabled={!betting || !mine.length || !!busy} onClick={() => void onCancel()}>
                {busy === "cancel" ? "…" : "取消本局"}
              </button>
            </div>

            {err && <div className="text-xs text-banker">{err}</div>}
            {!me && !loading && (
              <div className="text-center text-xs text-cream/60">
                <Link href="/login" className="underline">
                  登入
                </Link>
                後即可下注，新手送 {fmt(DEFAULT_ECONOMY.welcome_pack)} 金幣
              </div>
            )}
          </div>
        </section>

        {/* ---------- road ---------- */}
        <aside className="flex w-full flex-col gap-2 sm:w-80">
          <div className="flex items-center justify-between text-xs text-cream/60">
            <span className="font-display text-sm text-gold">路紙</span>
            <span>近 {Math.min(t.results.length, 72)} 局</span>
          </div>
          <BeadRoad results={t.results} />
          <RoadStats results={t.results.slice(-72)} />
          <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto text-[11px] text-cream/60">
            {[...t.results].reverse().slice(0, 12).map((r) => (
              <li key={r.roundNo} className="flex justify-between">
                <span>#{r.roundNo}</span>
                <span className="num">
                  {fmtPx(r.lockPrice)} → {fmtPx(r.closePrice)}
                </span>
                <span className={r.winner === "BANKER" ? "text-banker" : r.winner === "PLAYER" ? "text-player" : "text-void"}>
                  {r.winner === "BANKER" ? "莊" : r.winner === "PLAYER" ? "閒" : "和"}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {me && (
        <footer className="flex items-center justify-between px-4 pb-4 text-xs text-cream/50" style={{ paddingBottom: "calc(1rem + var(--safe-bottom))" }}>
          <span>登入方式：{me.identities.map((i) => i.provider).join(" · ")}</span>
          <button
            className="underline"
            onClick={async () => {
              await logout();
              await reload();
            }}
          >
            登出
          </button>
        </footer>
      )}
    </main>
  );
}

function Countdown({ betting, secsLeft }: { betting: RoundView | null; secsLeft: number }) {
  if (!betting)
    return (
      <div className="text-right">
        <div className="text-[10px] text-cream/50">等待開局</div>
        <div className="num text-2xl text-cream/40">--:--</div>
      </div>
    );
  const urgent = secsLeft <= 10;
  return (
    <div className="text-right">
      <div className="text-[10px] text-cream/50">第 {betting.roundNo} 局 · 下注倒數</div>
      <div className={`num text-3xl ${urgent ? "text-banker animate-pulse" : "text-gold-bright"}`}>
        {Math.floor(secsLeft / 60)}:{String(secsLeft % 60).padStart(2, "0")}
      </div>
    </div>
  );
}

function BetArea({
  side,
  view,
  odds,
  mine,
  disabled,
  busy,
  onClick,
}: {
  side: Side;
  view: RoundView | null;
  odds: number;
  mine: number;
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  const isB = side === "BANKER";
  const pool = isB ? (view?.poolBanker ?? 0) : (view?.poolPlayer ?? 0);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative flex flex-col items-center rounded-xl border-2 py-5 transition active:scale-[.98] disabled:opacity-60 ${
        isB ? "border-banker/70 bg-banker/20 text-banker hover:bg-banker/30" : "border-player/70 bg-player/20 text-player hover:bg-player/30"
      }`}
    >
      <div className="font-display text-4xl leading-none">{isB ? "莊" : "閒"}</div>
      <div className="mt-1 text-[10px] uppercase tracking-widest opacity-70">{isB ? "BANKER · 漲" : "PLAYER · 跌"}</div>
      <div className="num mt-3 text-lg text-cream">×{odds.toFixed(2)}</div>
      <div className="num text-xs text-cream/60">池 {fmt(pool)}</div>
      {mine > 0 && <div className="num absolute right-2 top-2 rounded-full border border-gold bg-felt-dark/80 px-2 py-0.5 text-[11px] text-gold-bright">我 {fmt(mine)}</div>}
      {busy && <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/30 text-cream">…</div>}
    </button>
  );
}
