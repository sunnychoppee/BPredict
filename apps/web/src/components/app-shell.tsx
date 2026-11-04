"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { fmt, fmtPx, sound } from "@bpredict/ui";
import { TelegramAutoLogin } from "@/components/telegram-auto-login";
import { Toasts } from "@/components/toasts";
import { useMe } from "@/components/use-me";
import { useTable } from "@/lib/table-store";

const TABS = [
  { href: "/", label: "牌桌", icon: "🎴" },
  { href: "/rewards", label: "獎勵", icon: "🎁" },
  { href: "/shop", label: "商店", icon: "🪙" },
  { href: "/leaderboard", label: "排行", icon: "🏆" },
  { href: "/me", label: "我的", icon: "👤" },
] as const;

/** Shared chrome: top bar (logo · price · balances), PC nav links, mobile bottom tabs. */
export function AppShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const pathname = usePathname();
  const { me, loading } = useMe();
  const t = useTable();
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setMuted(sound().muted);
    const unlock = () => sound().unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    if (me) t.setCoins(me.balances.find((b) => b.currency === "COINS")?.amount ?? 0);
    else if (!loading) t.setCoins(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, loading]);

  const gems = me?.balances.find((b) => b.currency === "GEMS")?.amount ?? 0;
  const delta = t.locked?.lockPrice != null && t.price ? t.price.price - t.locked.lockPrice : null;

  return (
    <div className="flex min-h-screen flex-col" style={{ paddingTop: "var(--safe-top)" }}>
      <TelegramAutoLogin />
      <Toasts />

      <header className="sticky top-0 z-30 border-b border-gold/30 bg-felt-dark/95 backdrop-blur">
        <div className={`mx-auto flex items-center justify-between gap-3 px-3 py-2 ${wide ? "max-w-6xl" : "max-w-md lg:max-w-6xl"}`}>
          <Link href="/" className="flex items-center gap-2">
            <span className="font-display text-lg tracking-wide text-gold">莊閒</span>
            <span className={`h-1.5 w-1.5 rounded-full ${t.connected ? "bg-emerald-400" : "bg-banker animate-pulse"}`} />
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
            {TABS.map((tab) => (
              <Link key={tab.href} href={tab.href} className={`rounded-md px-3 py-1.5 text-sm transition ${pathname === tab.href ? "bg-gold/15 text-gold-bright" : "text-cream/70 hover:text-gold-bright"}`}>
                {tab.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2 text-sm">
            {t.price && (
              <span className="num hidden text-cream/90 sm:inline">
                BTC {fmtPx(t.price.price)}
                {delta != null && <span className={`ml-1 text-xs ${delta > 0 ? "text-banker" : delta < 0 ? "text-player" : "text-void"}`}>{delta > 0 ? "▲" : delta < 0 ? "▼" : "＝"}</span>}
              </span>
            )}
            {me ? (
              <Link href="/shop" className="flex items-center gap-2 rounded-full border border-gold/40 bg-felt-dark px-2.5 py-1">
                <span className="num text-gold-bright">🪙 {fmt(t.coins ?? 0)}</span>
                <span className="num hidden text-cream/70 sm:inline">💎 {fmt(gems)}</span>
              </Link>
            ) : loading ? (
              <span className="text-cream/50">…</span>
            ) : (
              <Link href="/login" className="btn-gold text-xs">
                登入
              </Link>
            )}
            <button
              aria-label={muted ? "開啟音效" : "關閉音效"}
              className="rounded-md px-1.5 text-base text-cream/60 hover:text-gold-bright"
              onClick={() => {
                const m = !muted;
                sound().setMuted(m);
                setMuted(m);
                if (!m) sound().play("click");
              }}
            >
              {muted ? "🔇" : "🔊"}
            </button>
          </div>
        </div>
      </header>

      <main className={`mx-auto w-full flex-1 px-3 pb-24 pt-3 lg:pb-6 ${wide ? "max-w-6xl" : "max-w-md lg:max-w-6xl"}`}>{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-gold/30 bg-felt-dark/95 backdrop-blur lg:hidden" style={{ paddingBottom: "var(--safe-bottom)" }}>
        <div className="mx-auto grid max-w-md grid-cols-5">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link key={tab.href} href={tab.href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "text-gold-bright" : "text-cream/55"}`} onClick={() => sound().play("click")}>
                <span className={`text-lg leading-none ${active ? "drop-shadow-[0_0_6px_rgba(232,201,122,.8)]" : "opacity-80"}`}>{tab.icon}</span>
                {tab.label}
                {active && <span className="mt-0.5 h-0.5 w-5 rounded-full bg-gold" />}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
