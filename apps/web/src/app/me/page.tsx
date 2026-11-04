"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { LedgerEntryView, LedgerType, UserStatsView } from "@bpredict/shared";
import { Card, GoldButton, Panel, Pill, fmt } from "@bpredict/ui";
import { AppShell } from "@/components/app-shell";
import { useMe } from "@/components/use-me";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { UI_LOCALES, fmtDate, fmtDateTime, useLocale, type UiLocale } from "@/lib/i18n";
import { useTable } from "@/lib/table-store";

const PROVIDER_LABEL = { TELEGRAM: "Telegram", GOOGLE: "Google", EMAIL: "Email" } as const;

export default function MePage() {
  return (
    <AppShell>
      <MeView />
    </AppShell>
  );
}

function MeView() {
  const t = useTranslations("me");
  const tc = useTranslations("common");
  const router = useRouter();
  const { me, loading, reload } = useMe();
  const auth = useAuth();
  const { locale, setLocale } = useLocale();
  const coins = useTable((s) => s.coins);
  const pushToast = useTable((s) => s.pushToast);
  const [stats, setStats] = useState<UserStatsView | null>(null);
  const [ledger, setLedger] = useState<LedgerEntryView[]>([]);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nick, setNick] = useState("");

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

  async function saveNickname() {
    if (!me || nick.trim() === me.user.nickname) return setEditing(false);
    setBusy(true);
    try {
      await api("/me", { method: "PATCH", body: JSON.stringify({ nickname: nick.trim() }) });
      pushToast("info", t("nicknameSaved"));
      setEditing(false);
      await reload();
    } catch (e) {
      pushToast("error", e instanceof ApiError ? e.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function changeLocale(l: UiLocale) {
    setLocale(l);
    if (me) await api("/me", { method: "PATCH", body: JSON.stringify({ locale: l }) }).catch(() => undefined);
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

  if (loading) return <Panel className="p-6 text-center text-cream/60">{tc("loading")}</Panel>;
  if (!me)
    return (
      <Panel className="p-6 text-center">
        <div className="font-display text-xl text-gold">{tc("notLoggedIn")}</div>
        <p className="mt-2 text-sm text-cream/70">{t("loginBlurb")}</p>
        <Link href="/login" className="btn-gold mt-4 inline-block">
          {tc("goLogin")}
        </Link>
        <LanguageRow locale={locale} onChange={(l) => void changeLocale(l)} label={t("language")} />
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
            {editing ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveNickname();
                }}
              >
                <input className="input flex-1 py-1 text-sm" value={nick} onChange={(e) => setNick(e.target.value)} minLength={2} maxLength={24} autoFocus placeholder={t("nicknameHint")} />
                <button className="btn-gold px-2 py-1 text-xs" disabled={busy}>
                  {tc("save")}
                </button>
                <button type="button" className="text-xs text-cream/60" onClick={() => setEditing(false)}>
                  {tc("cancel")}
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <span className="truncate font-display text-xl text-gold-bright">{me.user.nickname}</span>
                {me.user.isVip && <Pill>{me.user.vipExpiresAt ? t("vipUntil", { d: fmtDate(me.user.vipExpiresAt, locale) }) : "VIP"}</Pill>}
                <button
                  className="text-[11px] text-cream/50 hover:text-gold-bright"
                  onClick={() => {
                    setNick(me.user.nickname);
                    setEditing(true);
                  }}
                  aria-label={t("editNickname")}
                >
                  ✎ {t("edit")}
                </button>
              </div>
            )}
            <div className="mt-0.5 text-[11px] text-cream/55">{me.identities.map((i) => `${PROVIDER_LABEL[i.provider]}${i.email ? ` · ${i.email}` : ""}`).join("、") || "—"}</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Card className="p-3">
            <div className="text-[11px] text-cream/55">{tc("coins")}</div>
            <div className="num text-2xl text-gold-bright">🪙 {fmt(coins ?? me.balances.find((b) => b.currency === "COINS")?.amount ?? 0)}</div>
          </Card>
          <Card className="p-3">
            <div className="text-[11px] text-cream/55">{tc("gems")}</div>
            <div className="num text-2xl text-cream">💎 {fmt(gems)}</div>
          </Card>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link href="/shop" className="btn-outline block text-center text-sm">
            {t("toShop")}
          </Link>
          <Link href="/history" className="btn-outline block text-center text-sm">
            {t("history")}
          </Link>
        </div>
      </Panel>

      <Panel className="p-4">
        <div className="font-display text-lg text-gold">{t("stats")}</div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label={t("totalRounds")} value={stats ? fmt(stats.totalRounds) : "—"} />
          <Stat label={t("winRate")} value={winRate != null ? `${winRate}%` : "—"} />
          <Stat label={t("net")} value={stats ? `${stats.netProfit >= 0 ? "+" : "−"}${fmt(Math.abs(stats.netProfit))}` : "—"} tone={stats ? (stats.netProfit >= 0 ? "banker" : "player") : undefined} />
          <Stat label={t("wins")} value={stats ? fmt(stats.wins) : "—"} />
          <Stat label={t("curStreak")} value={stats ? `${stats.currentStreak}` : "—"} />
          <Stat label={t("maxStreak")} value={stats ? `${stats.maxStreak}` : "—"} />
        </div>
      </Panel>

      <Panel className="p-4">
        <div className="font-display text-lg text-gold">{t("ledger")}</div>
        {ledger.length === 0 ? (
          <div className="mt-3 text-center text-sm text-cream/50">{t("noLedger")}</div>
        ) : (
          <ul className="mt-2 divide-y divide-gold/10 text-sm">
            {ledger.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="text-cream/90">{t(`ledgerType.${e.type as LedgerType}`)}</div>
                  <div className="text-[10px] text-cream/45">{fmtDateTime(e.createdAt, locale)}</div>
                </div>
                <div className="text-right">
                  <div className={`num ${e.amount >= 0 ? "text-emerald-300" : "text-banker"}`}>
                    {e.amount >= 0 ? "+" : "−"}
                    {fmt(Math.abs(e.amount))} {e.currency === "GEMS" ? "💎" : ""}
                  </div>
                  <div className="num text-[10px] text-cream/45">{t("balanceAfter", { n: fmt(e.balanceAfter) })}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {more && ledger.length > 0 && (
          <GoldButton variant="ghost" className="mt-2 w-full" disabled={busy} onClick={() => void loadMore()}>
            {tc("loadMore")}
          </GoldButton>
        )}
      </Panel>

      <Panel className="p-4">
        <LanguageRow locale={locale} onChange={(l) => void changeLocale(l)} label={t("language")} />
        {me.isAdmin && (
          <Link href="/admin" className="btn-outline mt-3 block text-center text-sm">
            🛠 {t("admin")}
          </Link>
        )}
      </Panel>

      <GoldButton variant="outline" disabled={busy} onClick={() => void logout()}>
        {t("logout")}
      </GoldButton>
      <p className="pb-2 text-center text-[10px] text-cream/40">{tc("disclaimer")}</p>
    </div>
  );
}

function LanguageRow({ locale, onChange, label }: { locale: UiLocale; onChange: (l: UiLocale) => void; label: string }) {
  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <span className="text-cream/70">🌐 {label}</span>
      <div className="flex gap-1 rounded-md border border-gold/30 p-0.5 text-xs">
        {UI_LOCALES.map((l) => (
          <button key={l.id} onClick={() => onChange(l.id)} className={`rounded px-2 py-0.5 ${locale === l.id ? "bg-gold text-felt-dark" : "text-cream/70"}`}>
            {l.label}
          </button>
        ))}
      </div>
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
