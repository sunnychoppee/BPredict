"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ClaimResult, RewardsView } from "@bpredict/shared";
import { Card, GoldButton, Panel, Pill, fmt, mmss } from "@bpredict/ui";
import { sound } from "@bpredict/ui";
import { AppShell } from "@/components/app-shell";
import { useMe } from "@/components/use-me";
import { api, ApiError } from "@/lib/api";
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
      pushToast("error", e instanceof ApiError ? e.message : "領取失敗，請稍後再試");
      void load();
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Panel className="p-6 text-center text-cream/60">載入中…</Panel>;
  if (!me)
    return (
      <Panel className="p-6 text-center">
        <div className="font-display text-xl text-gold">尚未登入</div>
        <p className="mt-2 text-sm text-cream/70">登入後即可領取每日簽到、定時補給等免費金幣。</p>
        <Link href="/login" className="btn-gold mt-4 inline-block">
          前往登入
        </Link>
      </Panel>
    );
  if (!view) return <Panel className="p-6 text-center text-cream/60">載入中…</Panel>;

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
          <h1 className="font-display text-xl text-gold">🎁 每日簽到</h1>
          <span className="text-[11px] text-cream/55">{view.checkin.claimedToday ? `明日可領 · ${hms(dayLeft)}` : `今日尚未簽到 · 剩 ${hms(dayLeft)}`}</span>
        </div>
        <p className="mt-1 text-xs text-cream/60">連續簽到 7 天獎勵遞增，斷簽重新計算。目前連續 {view.checkin.streak} 天。</p>
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
                <div className="text-[10px] text-cream/55">第{i + 1}天</div>
                <div className="my-1 text-base">{claimed ? "✅" : i === 6 ? "💰" : "🪙"}</div>
                <div className={`num text-[10px] ${claimed ? "text-gold" : "text-cream/80"}`}>{fmt(amt)}</div>
              </div>
            );
          })}
        </div>
        <GoldButton className="mt-3 w-full" disabled={!view.checkin.available || busy !== null} onClick={() => void claim("checkin")}>
          {view.checkin.claimedToday ? "今日已簽到" : `簽到領取 ${fmt(view.checkin.amounts[view.checkin.nextIndex] ?? 0)} 金幣`}
        </GoldButton>
      </Panel>

      {/* Timed supply */}
      <Panel className="p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-gold">⏱ 定時補給</h2>
          <Pill tone={view.supply.charges > 0 ? "gold" : "void"}>
            {view.supply.charges}/{view.supply.maxStack} 次可領
          </Pill>
        </div>
        <p className="mt-1 text-xs text-cream/60">
          每 {view.supply.intervalH} 小時補給 {fmt(view.supply.amount)} 金幣，最多累積 {view.supply.maxStack} 次。
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex flex-1 gap-1.5">
            {Array.from({ length: view.supply.maxStack }).map((_, i) => (
              <div key={i} className={`h-2.5 flex-1 rounded-full ${i < view.supply.charges ? "bg-gradient-to-r from-gold to-gold-bright" : "bg-felt-dark/80 border border-gold/20"}`} />
            ))}
          </div>
          <span className="num text-xs text-cream/60">{view.supply.nextAt ? `下次 ${mmss(Math.max(0, Math.floor((view.supply.nextAt - now) / 1000)))}` : "已滿"}</span>
        </div>
        <GoldButton className="mt-3 w-full" variant={view.supply.charges > 0 ? "solid" : "outline"} disabled={view.supply.charges === 0 || busy !== null} onClick={() => void claim("supply")}>
          {view.supply.charges > 0 ? `領取補給 ${fmt(view.supply.amount)} 金幣` : "補給中…"}
        </GoldButton>
      </Panel>

      {/* VIP daily + relief */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="flex flex-col">
          <div className="flex items-center justify-between">
            <div className="font-display text-base text-gold">👑 VIP 每日金幣</div>
            {view.vipDaily.isVip ? <Pill>VIP</Pill> : <Pill tone="void">未開通</Pill>}
          </div>
          <p className="mt-1 flex-1 text-xs text-cream/60">
            VIP 會員每日可領 {fmt(view.vipDaily.amount)} 金幣。
            {view.vipDaily.vipExpiresAt && view.vipDaily.isVip && <> 到期：{new Date(view.vipDaily.vipExpiresAt).toLocaleDateString("zh-TW")}</>}
          </p>
          {view.vipDaily.isVip ? (
            <GoldButton className="mt-3 w-full" disabled={!view.vipDaily.available || busy !== null} onClick={() => void claim("vip-daily")}>
              {view.vipDaily.claimedToday ? "今日已領取" : `領取 ${fmt(view.vipDaily.amount)} 金幣`}
            </GoldButton>
          ) : (
            <Link href="/shop#vip" className="btn-outline mt-3 block text-center text-sm">
              開通 VIP 月卡
            </Link>
          )}
        </Card>

        <Card className="flex flex-col">
          <div className="flex items-center justify-between">
            <div className="font-display text-base text-gold">🆘 救濟金</div>
            <Pill tone={view.relief.available ? "gold" : "void"}>{view.relief.claimedToday ? "今日已領" : view.relief.available ? "可領取" : "未符合"}</Pill>
          </div>
          <p className="mt-1 flex-1 text-xs text-cream/60">
            餘額低於 {fmt(view.relief.threshold)} 且其他獎勵皆已領取時，每日可領 {fmt(view.relief.amount)} 金幣。
            {view.relief.reason === "balance" && <span className="text-cream/45"> （目前餘額充足）</span>}
            {view.relief.reason === "other_rewards" && <span className="text-cream/45"> （請先領取簽到／補給）</span>}
          </p>
          <GoldButton className="mt-3 w-full" variant={view.relief.available ? "solid" : "outline"} disabled={!view.relief.available || busy !== null} onClick={() => void claim("relief")}>
            {view.relief.claimedToday ? "今日已領取" : `領取救濟金 ${fmt(view.relief.amount)}`}
          </GoldButton>
        </Card>
      </div>

      <p className="pb-2 text-center text-[10px] text-cream/40">獎勵以 UTC+8 每日 00:00 重置。金幣為虛擬道具，不可提現。</p>
    </div>
  );
}

function hms(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
