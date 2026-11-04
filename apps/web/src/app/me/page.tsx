"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { LedgerEntryView, LedgerType, UserStatsView } from "@bpredict/shared";
import { Card, GoldButton, Panel, Pill, fmt } from "@bpredict/ui";
import { AppShell } from "@/components/app-shell";
import { useMe } from "@/components/use-me";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { useTable } from "@/lib/table-store";

const LEDGER_LABEL: Record<LedgerType, string> = {
  WELCOME: "新手禮包",
  DAILY_CHECKIN: "每日簽到",
  TIMED_SUPPLY: "定時補給",
  RELIEF: "救濟金",
  REFERRAL: "邀請獎勵",
  BET: "下注",
  BET_CANCEL: "撤銷下注",
  PAYOUT: "派彩",
  REFUND: "退還",
  PURCHASE: "購買",
  ADMIN_ADJUST: "系統調整",
};

const PROVIDER_LABEL = { TELEGRAM: "Telegram", GOOGLE: "Google", EMAIL: "Email" } as const;

export default function MePage() {
  return (
    <AppShell>
      <MeView />
    </AppShell>
  );
}

function MeView() {
  const router = useRouter();
  const { me, loading } = useMe();
  const auth = useAuth();
  const coins = useTable((s) => s.coins);
  const [stats, setStats] = useState<UserStatsView | null>(null);
  const [ledger, setLedger] = useState<LedgerEntryView[]>([]);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!me) return;
    void api<UserStatsView>("/me/stats").then(setStats).catch(() => setStats(null));
    void api<LedgerEntryView[]>("/me/ledger?limit=30")
      .then((rows) => {
        setLedger(rows);
        setMore(rows.length === 30);
      })
      .catch(() => setLedger([]));
  }, [me]);

  async function loadMore() {
    const last = ledger.at(-1);
    if (!last) return;
    setBusy(true);
    try {
      const rows = await api<LedgerEntryView[]>(`/me/ledger?limit=30&before=${last.id}`);
      setLedger((l) => [...l, ...rows]);
      setMore(rows.length === 30);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      if (auth.refreshToken) await api("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken: auth.refreshToken }) }).catch(() => undefined);
    } finally {
      auth.clear();
      setBusy(false);
      router.push("/");
    }
  }

  if (loading) return <Panel className="p-6 text-center text-cream/60">載入中…</Panel>;
  if (!me)
    return (
      <Panel className="p-6 text-center">
        <div className="font-display text-xl text-gold">尚未登入</div>
        <p className="mt-2 text-sm text-cream/70">登入後即可查看戰績與金幣紀錄。</p>
        <Link href="/login" className="btn-gold mt-4 inline-block">
          前往登入
        </Link>
      </Panel>
    );

  const gems = me.balances.find((b) => b.currency === "GEMS")?.amount ?? 0;
  const winRate = stats && stats.totalRounds ? Math.round((stats.wins / stats.totalRounds) * 100) : null;

  return (
    <div className="flex flex-col gap-3">
      <Panel className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 border-gold bg-felt-dark text-2xl">
            {me.user.avatarUrl ? <img src={me.user.avatarUrl} alt="" className="h-full w-full object-cover" /> : "👤"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-display text-xl text-gold-bright">{me.user.nickname}</span>
              {me.user.isVip && <Pill>VIP</Pill>}
            </div>
            <div className="mt-0.5 text-[11px] text-cream/55">
              {me.identities.map((i) => `${PROVIDER_LABEL[i.provider]}${i.email ? ` · ${i.email}` : ""}`).join("、") || "—"}
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Card className="p-3">
            <div className="text-[11px] text-cream/55">金幣</div>
            <div className="num text-2xl text-gold-bright">🪙 {fmt(coins ?? me.balances.find((b) => b.currency === "COINS")?.amount ?? 0)}</div>
          </Card>
          <Card className="p-3">
            <div className="text-[11px] text-cream/55">寶石</div>
            <div className="num text-2xl text-cream">💎 {fmt(gems)}</div>
          </Card>
        </div>
        <Link href="/shop" className="btn-outline mt-3 block text-center text-sm">
          前往商店
        </Link>
      </Panel>

      <Panel className="p-4">
        <div className="font-display text-lg text-gold">戰績</div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="總局數" value={stats ? fmt(stats.totalRounds) : "—"} />
          <Stat label="勝率" value={winRate != null ? `${winRate}%` : "—"} />
          <Stat label="淨勝" value={stats ? `${stats.netProfit >= 0 ? "+" : "−"}${fmt(Math.abs(stats.netProfit))}` : "—"} tone={stats ? (stats.netProfit >= 0 ? "banker" : "player") : undefined} />
          <Stat label="勝場" value={stats ? fmt(stats.wins) : "—"} />
          <Stat label="當前連勝" value={stats ? `${stats.currentStreak}` : "—"} />
          <Stat label="最長連勝" value={stats ? `${stats.maxStreak}` : "—"} />
        </div>
      </Panel>

      <Panel className="p-4">
        <div className="font-display text-lg text-gold">金幣紀錄</div>
        {ledger.length === 0 ? (
          <div className="mt-3 text-center text-sm text-cream/50">尚無紀錄</div>
        ) : (
          <ul className="mt-2 divide-y divide-gold/10 text-sm">
            {ledger.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="text-cream/90">{LEDGER_LABEL[e.type] ?? e.type}</div>
                  <div className="text-[10px] text-cream/45">{new Date(e.createdAt).toLocaleString("zh-TW", { hour12: false })}</div>
                </div>
                <div className="text-right">
                  <div className={`num ${e.amount >= 0 ? "text-emerald-300" : "text-banker"}`}>
                    {e.amount >= 0 ? "+" : "−"}
                    {fmt(Math.abs(e.amount))} {e.currency === "GEMS" ? "💎" : ""}
                  </div>
                  <div className="num text-[10px] text-cream/45">餘額 {fmt(e.balanceAfter)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {more && ledger.length > 0 && (
          <GoldButton variant="ghost" className="mt-2 w-full" disabled={busy} onClick={() => void loadMore()}>
            載入更多
          </GoldButton>
        )}
      </Panel>

      <GoldButton variant="outline" disabled={busy} onClick={() => void logout()}>
        登出
      </GoldButton>
      <p className="pb-2 text-center text-[10px] text-cream/40">金幣與寶石為虛擬道具，僅供娛樂，不可提現或兌換。</p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "banker" | "player" }) {
  return (
    <div className="rounded-lg border border-gold/20 bg-felt-dark/50 p-2">
      <div className="text-[10px] text-cream/50">{label}</div>
      <div className={`num text-lg ${tone === "banker" ? "text-emerald-300" : tone === "player" ? "text-banker" : "text-cream"}`}>{value}</div>
    </div>
  );
}
