"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { TABLE_ID_BTC, type MyRoundView, type RoundView } from "@bpredict/shared";
import { GoldButton, Panel, fmt, fmtPx } from "@bpredict/ui";
import { AppShell } from "@/components/app-shell";
import { useMe } from "@/components/use-me";
import { api } from "@/lib/api";
import { fmtDateTime, useLocale } from "@/lib/i18n";

type TableRound = RoundView & { voidReason: string | null; settledAt: number | null };

export default function HistoryPage() {
  return (
    <AppShell>
      <History />
    </AppShell>
  );
}

function History() {
  const t = useTranslations("history");
  const tc = useTranslations("common");
  const locale = useLocale((s) => s.locale);
  const { me, loading } = useMe();
  const [tab, setTab] = useState<"table" | "mine">("table");
  const [rounds, setRounds] = useState<TableRound[]>([]);
  const [mine, setMine] = useState<MyRoundView[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<TableRound[]>(`/tables/${TABLE_ID_BTC}/rounds?limit=50`)
      .then(setRounds)
      .catch(() => setRounds([]));
  }, []);

  const loadMine = useCallback(
    async (before?: number) => {
      setBusy(true);
      try {
        const r = await api<{ items: MyRoundView[]; nextBefore: number | null }>(`/me/rounds?limit=30${before ? `&before=${before}` : ""}`);
        setMine((m) => (before ? [...m, ...r.items] : r.items));
        setNextBefore(r.nextBefore);
      } catch {
        if (!before) setMine([]);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (me) void loadMine();
  }, [me, loadMine]);

  const side = (s: MyRoundView["side"]) => (s === "BANKER" ? tc("banker") : s === "PLAYER" ? tc("player") : tc("mixed"));
  const winner = (w: "BANKER" | "PLAYER" | null) => (w === "BANKER" ? tc("banker") : w === "PLAYER" ? tc("player") : tc("tie"));
  const winCls = (w: "BANKER" | "PLAYER" | null) => (w === "BANKER" ? "text-banker" : w === "PLAYER" ? "text-player" : "text-void");

  return (
    <div className="flex flex-col gap-3">
      <Panel className="p-4">
        <h1 className="font-display text-xl text-gold">{t("title")}</h1>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg border border-gold/30 p-0.5 text-sm">
          {(["table", "mine"] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-md py-1.5 ${tab === k ? "bg-gold text-felt-dark" : "text-cream/70 hover:text-gold-bright"}`}>
              {t(k)}
            </button>
          ))}
        </div>
      </Panel>

      {tab === "table" ? (
        <Panel className="p-2">
          {rounds.length === 0 ? (
            <div className="p-6 text-center text-sm text-cream/60">{t("empty")}</div>
          ) : (
            <ul className="divide-y divide-gold/10 text-sm">
              {rounds.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-2 py-2">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${r.winner === "BANKER" ? "bg-banker" : r.winner === "PLAYER" ? "bg-player" : "bg-void"}`}>{r.status === "VOIDED" ? "—" : winner(r.winner)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="num text-cream/90">
                      #{r.roundNo} · {fmtPx(r.lockPrice)} → {fmtPx(r.closePrice)}
                    </div>
                    <div className="text-[10px] text-cream/45">
                      {fmtDateTime(r.closeAt, locale)}
                      {r.status === "VOIDED" && <span className="ml-1 text-void">· {t("void")}</span>}
                    </div>
                  </div>
                  <div className="num text-right text-[11px] text-cream/60">
                    <div className="text-banker">{fmt(r.poolBanker)}</div>
                    <div className="text-player">{fmt(r.poolPlayer)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : !me && !loading ? (
        <Panel className="p-6 text-center text-sm text-cream/70">
          <Link href="/login" className="underline">
            {tc("login")}
          </Link>{" "}
          · {t("loginHint")}
        </Panel>
      ) : (
        <Panel className="p-2">
          {mine.length === 0 ? (
            <div className="p-6 text-center text-sm text-cream/60">{busy || loading ? tc("loading") : t("empty")}</div>
          ) : (
            <ul className="divide-y divide-gold/10 text-sm">
              {mine.map((r) => {
                const refunded = r.winner === null;
                // "Won" = my side came in, even if the rake left the net slightly negative on a lopsided pool.
                const won = !refunded && r.payout > 0;
                return (
                  <li key={r.roundId} className="flex items-center gap-3 px-2 py-2">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${winCls(r.winner).replace("text-", "bg-")}`}>{winner(r.winner)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-cream/90">
                        <span className="num">#{r.roundNo}</span> · {side(r.side)} {fmt(r.stake)}
                        {r.streakBonus > 0 && <span className="ml-1 text-[10px] text-gold">🔥 +{fmt(r.streakBonus)}</span>}
                      </div>
                      <div className="num text-[10px] text-cream/45">
                        {fmtDateTime(r.closeAt, locale)} · {fmtPx(r.lockPrice)} → {fmtPx(r.closePrice)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`num text-base ${r.net > 0 ? "text-pos" : refunded ? "text-cream/70" : "text-neg"}`}>{refunded ? `±0` : `${r.net >= 0 ? "+" : "−"}${fmt(Math.abs(r.net))}`}</div>
                      <div className="text-[10px] text-cream/45">{won ? t("won") : refunded ? t("refunded") : t("lost")}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {nextBefore && (
            <GoldButton variant="ghost" className="mt-2 w-full" disabled={busy} onClick={() => void loadMine(nextBefore)}>
              {tc("loadMore")}
            </GoldButton>
          )}
        </Panel>
      )}
    </div>
  );
}
