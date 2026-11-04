"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import type { ClaimResult, RewardsView } from "@bpredict/shared";
import { Card, GoldButton, Panel, Pill, fmt, mmss } from "@bpredict/ui";
import { sound } from "@bpredict/ui";
import { AppShell } from "@/components/app-shell";
import { useMe } from "@/components/use-me";
import { api, ApiError } from "@/lib/api";
import { fmtDate, useLocale } from "@/lib/i18n";
import { useTable } from "@/lib/table-store";

export default function RewardsPage() {
  return (
    <AppShell>
      <RewardsView />
    </AppShell>
  );
}

type ClaimKind = "checkin" | "supply" | "relief" | "vip-daily";

function RewardsView() {
  const t = useTranslations("rewards");
  const tc = useTranslations("common");
  const locale = useLocale((s) => s.locale);
  const { me, loading } = useMe();
  const pushToast = useTable((s) => s.pushToast);
  const setCoins = useTable((s) => s.setCoins);
  const [view, setView] = useState<RewardsView | null>(null);
  const [busy, setBusy] = useState<ClaimKind | null>(null);
  const [burst, setBurst] = useState<{ amount: number; key: number } | null>(null);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    try {
      setView(await api<RewardsView>("/rewards"));
    } catch {
      setView(null);
    }
  }, []);

  useEffect(() => {
    if (me) void load();
  }, [me, load]);

  // 1 s ticker for countdowns.
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  async function claim(kind: ClaimKind) {
    if (busy) return;
    setBusy(kind);
    try {
      const r = await api<ClaimResult>(`/rewards/${kind}`, { method: "POST" });
      setView(r.rewards);
      setCoins(r.balance);
      setBurst({ amount: r.amount, key: Date.now() });
      sound().play("win");
      setTimeout(() => setBurst(null), 1800);
    } catch (e) {
      pushToast("error", e instanceof ApiError ? e.message : t("claimFailed"));
      void load();
    } finally {
      setBusy(null);
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
      </Panel>
    );
  if (!view) return <Panel className="p-6 text-center text-cream/60">{tc("loading")}</Panel>;

  const now = Date.now();
  const dayLeft = Math.max(0, Math.floor((view.dayEndsAt - now) / 1000));

  return (
    <div className="relative flex flex-col gap-3">
      <AnimatePresence>
        {burst && (
          <motion.div
            key={burst.key}
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: -30, scale: 1.1 }}
            exit={{ opacity: 0, y: -80 }}
            transition={{ duration: 0.9 }}
            className="pointer-events-none fixed left-1/2 top-1/3 z-50 -translate-x-1/2 font-display text-4xl text-gold-bright drop-shadow-[0_0_14px_rgba(232,201,122,.8)]"
          >
            +{fmt(burst.amount)} 🪙
          </motion.div>
        )}
      </AnimatePresence>

      {/* Check-in */}
      <Panel className="p-4">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-xl text-gold">{t("checkin")}</h1>
          <span className="text-[11px] text-cream/55">{view.checkin.claimedToday ? t("tomorrow", { t: hms(dayLeft) }) : t("notYet", { t: hms(dayLeft) })}</span>
        </div>
        <p className="mt-1 text-xs text-cream/60">{t("checkinBlurb", { n: view.checkin.streak })}</p>
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {view.checkin.amounts.map((amt, i) => {
            const claimed = i < view.checkin.streak;
            const isNext = !view.checkin.claimedToday && i === view.checkin.nextIndex;
            return (
              <div
                key={i}
                className={`relative flex flex-col items-center rounded-lg border px-1 py-2 text-center ${
                  claimed ? "border-gold/50 bg-gold/15" : isNext ? "border-gold-bright bg-felt-dark shadow-[0_0_12px_rgba(232,201,122,.45)]" : "border-gold/15 bg-felt-dark/60"
                }`}
              >
                <div className="text-[10px] text-cream/55">{t("dayN", { n: i + 1 })}</div>
                <div className="my-1 text-base">{claimed ? "✅" : i === 6 ? "💰" : "🪙"}</div>
                <div className={`num text-[10px] ${claimed ? "text-gold" : "text-cream/80"}`}>{fmt(amt)}</div>
              </div>
            );
          })}
        </div>
        <GoldButton className="mt-3 w-full" disabled={!view.checkin.available || busy !== null} onClick={() => void claim("checkin")}>
          {view.checkin.claimedToday ? t("checkedIn") : t("claimCheckin", { n: fmt(view.checkin.amounts[view.checkin.nextIndex] ?? 0) })}
        </GoldButton>
      </Panel>

      {/* Timed supply */}
      <Panel className="p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-gold">{t("supply")}</h2>
          <Pill tone={view.supply.charges > 0 ? "gold" : "void"}>{t("charges", { n: view.supply.charges, max: view.supply.maxStack })}</Pill>
        </div>
        <p className="mt-1 text-xs text-cream/60">{t("supplyBlurb", { h: view.supply.intervalH, n: fmt(view.supply.amount), max: view.supply.maxStack })}</p>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex flex-1 gap-1.5">
            {Array.from({ length: view.supply.maxStack }).map((_, i) => (
              <div key={i} className={`h-2.5 flex-1 rounded-full ${i < view.supply.charges ? "bg-gradient-to-r from-gold to-gold-bright" : "bg-felt-dark/80 border border-gold/20"}`} />
            ))}
          </div>
          <span className="num text-xs text-cream/60">{view.supply.nextAt ? t("next", { t: mmss(Math.max(0, Math.floor((view.supply.nextAt - now) / 1000))) }) : t("full")}</span>
        </div>
        <GoldButton className="mt-3 w-full" variant={view.supply.charges > 0 ? "solid" : "outline"} disabled={view.supply.charges === 0 || busy !== null} onClick={() => void claim("supply")}>
          {view.supply.charges > 0 ? t("claimSupply", { n: fmt(view.supply.amount) }) : t("supplying")}
        </GoldButton>
      </Panel>

      {/* VIP daily + relief */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="flex flex-col">
          <div className="flex items-center justify-between">
            <div className="font-display text-base text-gold">{t("vipDaily")}</div>
            {view.vipDaily.isVip ? <Pill>VIP</Pill> : <Pill tone="void">{t("notVip")}</Pill>}
          </div>
          <p className="mt-1 flex-1 text-xs text-cream/60">
            {t("vipBlurb", { n: fmt(view.vipDaily.amount) })}
            {view.vipDaily.vipExpiresAt && view.vipDaily.isVip && t("expires", { d: fmtDate(view.vipDaily.vipExpiresAt, locale) })}
          </p>
          {view.vipDaily.isVip ? (
            <GoldButton className="mt-3 w-full" disabled={!view.vipDaily.available || busy !== null} onClick={() => void claim("vip-daily")}>
              {view.vipDaily.claimedToday ? t("claimedToday") : t("claimN", { n: fmt(view.vipDaily.amount) })}
            </GoldButton>
          ) : (
            <Link href="/shop#vip" className="btn-outline mt-3 block text-center text-sm">
              {t("openVip")}
            </Link>
          )}
        </Card>

        <Card className="flex flex-col">
          <div className="flex items-center justify-between">
            <div className="font-display text-base text-gold">{t("relief")}</div>
            <Pill tone={view.relief.available ? "gold" : "void"}>{view.relief.claimedToday ? t("claimedShort") : view.relief.available ? t("available") : t("notEligible")}</Pill>
          </div>
          <p className="mt-1 flex-1 text-xs text-cream/60">
            {t("reliefBlurb", { th: fmt(view.relief.threshold), n: fmt(view.relief.amount) })}
            {view.relief.reason === "balance" && <span className="text-cream/45"> {t("reliefBalance")}</span>}
            {view.relief.reason === "other_rewards" && <span className="text-cream/45"> {t("reliefOther")}</span>}
          </p>
          <GoldButton className="mt-3 w-full" variant={view.relief.available ? "solid" : "outline"} disabled={!view.relief.available || busy !== null} onClick={() => void claim("relief")}>
            {view.relief.claimedToday ? t("claimedToday") : t("claimRelief", { n: fmt(view.relief.amount) })}
          </GoldButton>
        </Card>
      </div>

      <p className="pb-2 text-center text-[10px] text-cream/40">{t("footer")}</p>
    </div>
  );
}

function hms(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
