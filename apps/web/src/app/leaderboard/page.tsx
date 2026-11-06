"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LEADERBOARD_BOARDS, LEADERBOARD_PERIODS, type LeaderboardBoard, type LeaderboardEntry, type LeaderboardPeriod, type LeaderboardView } from "@bpredict/shared";
import { Panel, Pill, fmt } from "@bpredict/ui";
import { AppShell } from "@/components/app-shell";
import { useMe } from "@/components/use-me";
import { api } from "@/lib/api";

export default function LeaderboardPage() {
  return (
    <AppShell>
      <Leaderboard />
    </AppShell>
  );
}

const MEDAL = ["🥇", "🥈", "🥉"];

function Leaderboard() {
  const t = useTranslations("lb");
  const tc = useTranslations("common");
  const { me, loading } = useMe();
  const [board, setBoard] = useState<LeaderboardBoard>("profit");
  const [period, setPeriod] = useState<LeaderboardPeriod>("day");
  const [view, setView] = useState<LeaderboardView | null>(null);
  const [err, setErr] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    if (loading) return; // wait for the token so `me` is included
    let alive = true;
    setView(null);
    setErr(false);
    api<LeaderboardView>(`/leaderboard?board=${board}&period=${period}`)
      .then((v) => alive && setView(v))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [board, period, loading, me?.user.id]);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const value = (e: LeaderboardEntry) => (board === "profit" ? `${e.value >= 0 ? "+" : "−"}${fmt(Math.abs(e.value))}` : board === "winrate" ? `${e.value.toFixed(1)}%` : `${e.value}`);
  const sub = (e: LeaderboardEntry) => (board === "winrate" ? t("winsRounds", { w: e.wins, n: e.rounds }) : t("rounds", { n: e.rounds }));

  return (
    <div className="flex flex-col gap-3">
      <Panel className="p-4">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-xl text-gold">{t("title")}</h1>
          {view && (
            <span className="text-[11px] text-cream/55">
              {view.range.seasonNo ? `${t("seasonNo", { n: view.range.seasonNo })} · ` : ""}
              {t("endsIn", { t: countdown(view.range.endsAt) })}
            </span>
          )}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg border border-gold/30 p-0.5 text-sm">
          {LEADERBOARD_BOARDS.map((b) => (
            <button key={b} onClick={() => setBoard(b)} className={`rounded-md py-1.5 ${board === b ? "bg-gold text-felt-dark" : "text-cream/70 hover:text-gold-bright"}`}>
              {t(b)}
            </button>
          ))}
        </div>
        <div className="mt-2 flex justify-center gap-1 text-xs">
          {LEADERBOARD_PERIODS.map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={`rounded-full px-3 py-1 ${period === p ? "bg-gold/20 text-gold-bright" : "text-cream/60 hover:text-cream"}`}>
              {t(p)}
            </button>
          ))}
        </div>
        {view?.minRounds != null && <div className="mt-2 text-center text-[11px] text-cream/50">{t("minRounds", { n: view.minRounds })}</div>}
      </Panel>

      {/* my row */}
      <Panel className="p-3">
        <div className="text-[11px] text-cream/55">{t("me")}</div>
        {!me && !loading ? (
          <div className="mt-1 text-sm text-cream/70">
            <Link href="/login" className="underline">
              {tc("login")}
            </Link>{" "}
            · {t("loginHint")}
          </div>
        ) : view?.me ? (
          <Row e={view.me} value={value(view.me)} sub={view.me.qualified ? sub(view.me) : t("notQualified", { n: view.me.rounds })} highlight rankLabel={view.me.qualified && view.me.rank > 0 ? `#${view.me.rank}` : "—"} />
        ) : (
          <div className="mt-1 text-sm text-cream/60">{view ? t("unranked") : "…"}</div>
        )}
      </Panel>

      <Panel className="p-2">
        {err ? (
          <div className="p-4 text-center text-sm text-neg">{tc("error")}</div>
        ) : !view ? (
          <div className="p-4 text-center text-sm text-cream/60">{tc("loading")}</div>
        ) : view.entries.length === 0 ? (
          <div className="p-6 text-center text-sm text-cream/60">{t("empty")}</div>
        ) : (
          <ul className="divide-y divide-gold/10">
            {view.entries.map((e) => (
              <li key={e.userId}>
                <Row e={e} value={value(e)} sub={sub(e)} highlight={e.userId === me?.user.id} rankLabel={MEDAL[e.rank - 1] ?? `#${e.rank}`} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="pb-2 text-center text-[10px] text-cream/40">{t("footer", { days: 28 })}</p>
    </div>
  );
}

function Row({ e, value, sub, highlight, rankLabel }: { e: LeaderboardEntry; value: string; sub: string; highlight?: boolean; rankLabel: string }) {
  return (
    <div className={`flex items-center gap-3 rounded-lg px-2 py-2 ${highlight ? "bg-gold/10" : ""}`}>
      <div className={`num w-9 shrink-0 text-center ${e.rank <= 3 ? "text-xl" : "text-sm text-cream/60"}`}>{rankLabel}</div>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-felt-dark text-base ${e.rank === 1 ? "border-gold-bright shadow-[0_0_10px_rgba(232,201,122,.6)]" : "border-gold/40"}`}>
        {e.avatarUrl ? <img src={e.avatarUrl} alt="" className="h-full w-full object-cover" /> : "👤"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm text-cream">{e.nickname}</span>
          {e.isVip && <Pill>VIP</Pill>}
        </div>
        <div className="text-[10px] text-cream/50">{sub}</div>
      </div>
      <div className={`num text-right text-base ${value.startsWith("−") ? "text-neg" : "text-gold-bright"}`}>{value}</div>
    </div>
  );
}

function countdown(endsAt: number) {
  const s = Math.max(0, Math.floor((endsAt - Date.now()) / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${String(m).padStart(2, "0")}m`;
}
