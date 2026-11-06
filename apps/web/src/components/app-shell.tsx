"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { fmt, fmtPx, sound } from "@bpredict/ui";
import { TelegramAutoLogin } from "@/components/telegram-auto-login";
import { Toasts } from "@/components/toasts";
import { useMe } from "@/components/use-me";
import { useLocale } from "@/lib/i18n";
import { useTable } from "@/lib/table-store";
import { getTelegramWebApp, setClosingConfirmation } from "@/lib/telegram";
import { useUiMode } from "@/lib/ui-mode";
import { IconCart, IconGift, IconMarket, IconSound, IconTrophy, IconUser } from "@/components/icons";

const TABS = [
  { href: "/", key: "table", icon: "🎴", Icon: IconMarket },
  { href: "/rewards", key: "rewards", icon: "🎁", Icon: IconGift },
  { href: "/shop", key: "shop", icon: "🪙", Icon: IconCart },
  { href: "/leaderboard", key: "leaderboard", icon: "🏆", Icon: IconTrophy },
  { href: "/me", key: "me", icon: "👤", Icon: IconUser },
] as const;

/** Shared chrome: top bar (logo · price · balances), PC nav links, mobile bottom tabs. */
export function AppShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me, loading } = useMe();
  const t = useTable();
  const tn = useTranslations("nav");
  const tc = useTranslations("common");
  const adoptLocale = useLocale((s) => s.adoptFromProfile);
  const adoptMode = useUiMode((s) => s.adoptFromProfile);
  const fresh = useUiMode((s) => s.mode) === "fresh";
  const [muted, setMuted] = useState(false);

  // Telegram Mini App: native BackButton on sub-pages (fullscreen hides Telegram's own header).
  useEffect(() => {
    const wa = getTelegramWebApp();
    if (!wa) return;
    const back = () => (window.history.length > 1 ? router.back() : router.push("/"));
    try {
      if (pathname === "/") {
        wa.BackButton.hide();
        return;
      }
      wa.BackButton.show();
      wa.BackButton.onClick(back);
      return () => wa.BackButton.offClick(back);
    } catch {
      return;
    }
  }, [pathname, router]);

  // Don't let a swipe-down close the app while the user has chips on the table.
  const liveBets = t.myBets.length;
  useEffect(() => {
    setClosingConfirmation(liveBets > 0);
  }, [liveBets]);

  useEffect(() => {
    setMuted(sound().muted);
    const unlock = () => sound().unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    if (me) {
      t.setCoins(me.balances.find((b) => b.currency === "COINS")?.amount ?? 0);
      t.setGems(me.balances.find((b) => b.currency === "GEMS")?.amount ?? 0);
      adoptLocale(me.user.locale);
      adoptMode(me.user.uiMode);
    } else if (!loading) {
      t.setCoins(null);
      t.setGems(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, loading]);

  const gems = t.gems ?? me?.balances.find((b) => b.currency === "GEMS")?.amount ?? 0;
  const delta = t.locked?.lockPrice != null && t.price ? t.price.price - t.locked.lockPrice : null;

  return (
    <div className="flex min-h-screen flex-col" style={{ paddingTop: "var(--safe-top)" }}>
      <TelegramAutoLogin />
      <Toasts />

      {/* `top` tracks the Telegram fullscreen inset so the bar never slides under Telegram's own controls. */}
      <header className={`sticky z-30 border-b backdrop-blur ${fresh ? "border-cream/5 bg-felt/90" : "border-gold/30 bg-felt-dark/95"}`} style={{ top: "var(--safe-top)" }}>
        <div className={`mx-auto flex items-center justify-between gap-3 px-3 py-2 ${wide ? "max-w-6xl" : "max-w-md lg:max-w-6xl"}`}>
          <Link href="/" className="flex items-center gap-2">
            {fresh ? (
              <>
                {/* Live-feed indicator only where the WS is actually used (table page). */}
                <span className={`h-2 w-2 rounded-full ${pathname !== "/" ? "bg-gold" : t.connected ? "bg-banker" : "bg-player animate-pulse"}`} />
                <span className="font-display text-lg tracking-tight text-cream">{pathname === "/" ? "漲跌" : tn(TABS.find((x) => x.href === pathname)?.key ?? "table")}</span>
              </>
            ) : (
              <>
                <span className="font-display text-lg tracking-wide text-gold">莊閒</span>
                {pathname === "/" && <span className={`h-1.5 w-1.5 rounded-full ${t.connected ? "bg-emerald-400" : "bg-banker animate-pulse"}`} />}
              </>
            )}
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
            {TABS.map((tab) => (
              <Link key={tab.href} href={tab.href} className={`rounded-md px-3 py-1.5 text-sm transition ${pathname === tab.href ? (fresh ? "bg-gold/10 font-semibold text-gold" : "bg-gold/15 text-gold-bright") : "text-cream/70 hover:text-gold-bright"}`}>
                {tn(tab.key)}
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
              <Link href="/shop" className={`flex items-center gap-2 rounded-full border px-2.5 py-1 ${fresh ? "border-cream/10 bg-felt shadow-[0_1px_2px_rgba(0,0,0,.04)]" : "border-gold/40 bg-felt-dark"}`}>
                <span className={`num ${fresh ? "font-semibold text-cream" : "text-gold-bright"}`}>🪙 {fmt(t.coins ?? 0)}</span>
                <span className="num hidden text-cream/70 sm:inline">💎 {fmt(gems)}</span>
              </Link>
            ) : loading ? (
              <span className="text-cream/50">…</span>
            ) : (
              <Link href="/login" className="btn-gold text-xs">
                {tc("login")}
              </Link>
            )}
            <button
              aria-label={muted ? tc("soundOn") : tc("soundOff")}
              className="rounded-md px-1.5 text-base text-cream/60 hover:text-gold-bright"
              onClick={() => {
                const m = !muted;
                sound().setMuted(m);
                setMuted(m);
                if (!m) sound().play("click");
              }}
            >
              {fresh ? <IconSound muted={muted} width={20} height={20} /> : muted ? "🔇" : "🔊"}
            </button>
          </div>
        </div>
      </header>

      <main className={`mx-auto w-full flex-1 px-3 pb-24 pt-3 lg:pb-6 ${wide ? "max-w-6xl" : "max-w-md lg:max-w-6xl"}`}>{children}</main>

      <nav className={`fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur lg:hidden ${fresh ? "border-cream/5 bg-felt/95" : "border-gold/30 bg-felt-dark/95"}`} style={{ paddingBottom: "var(--safe-bottom)" }}>
        <div className="mx-auto grid max-w-md grid-cols-5">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link key={tab.href} href={tab.href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active ? (fresh ? "font-semibold text-gold" : "text-gold-bright") : fresh ? "text-cream/40" : "text-cream/55"}`} onClick={() => sound().play("click")}>
                {fresh ? <tab.Icon className="mb-0.5" /> : <span className={`text-lg leading-none ${active ? "drop-shadow-[0_0_6px_rgba(232,201,122,.8)]" : "opacity-80"}`}>{tab.icon}</span>}
                {tn(tab.key)}
                {active && !fresh && <span className="mt-0.5 h-0.5 w-5 rounded-full bg-gold" />}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
