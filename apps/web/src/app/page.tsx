"use client";

import Link from "next/link";
import { CHIP_DENOMINATIONS } from "@bpredict/shared";
import { TelegramAutoLogin } from "@/components/telegram-auto-login";
import { useMe } from "@/components/use-me";
import { logout } from "@/lib/api";

const fmt = (n: number) => n.toLocaleString("en-US");

export default function TablePage() {
  const { me, loading, error, reload } = useMe();
  const coins = me?.balances.find((b) => b.currency === "COINS")?.amount ?? 0;
  const gems = me?.balances.find((b) => b.currency === "GEMS")?.amount ?? 0;

  return (
    <main className="flex min-h-screen flex-col" style={{ paddingTop: "var(--safe-top)" }}>
      <TelegramAutoLogin />

      <header className="flex items-center justify-between border-b border-gold/30 bg-felt-dark px-4 py-3">
        <div className="font-display text-lg tracking-wide text-gold">莊閒 · BTC</div>
        {me ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="num text-gold-bright">🪙 {fmt(coins)}</span>
            <span className="num text-cream/80">💎 {fmt(gems)}</span>
            <span className="max-w-[8rem] truncate text-cream/70">{me.user.nickname}</span>
          </div>
        ) : loading ? (
          <span className="text-sm text-cream/50">…</span>
        ) : (
          <Link href="/login" className="btn-gold text-sm">
            登入
          </Link>
        )}
      </header>

      <section className="felt-surface relative mx-auto my-4 w-full max-w-md flex-1 rounded-2xl gold-frame p-4 shadow-inset sm:max-w-3xl">
        <div className="absolute inset-0 rounded-2xl bg-vignette" />
        <div className="relative flex h-full flex-col items-center justify-center gap-4 text-center">
          <div className="text-xs uppercase tracking-[.3em] text-gold/80">BTC / USDT · 5 分鐘一局</div>
          <div className="font-display text-3xl text-gold-bright">牌桌施工中</div>
          <p className="max-w-sm text-sm text-cream/70">
            W1 完成：帳號、登入、金幣帳本。局引擎（W2）與牌桌介面（W3）接續上線。
          </p>

          <div className="mt-4 grid w-full grid-cols-2 gap-3">
            <div className="rounded-xl border border-banker/60 bg-banker/20 py-6 text-banker">
              <div className="font-display text-2xl">莊</div>
              <div className="text-xs opacity-70">BANKER · 漲</div>
            </div>
            <div className="rounded-xl border border-player/60 bg-player/20 py-6 text-player">
              <div className="font-display text-2xl">閒</div>
              <div className="text-xs opacity-70">PLAYER · 跌</div>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {CHIP_DENOMINATIONS.map((d) => (
              <div
                key={d}
                className="num flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-gold/70 bg-felt-dark/60 text-xs text-gold-bright"
              >
                {d >= 1000 ? `${d / 1000}k` : d}
              </div>
            ))}
          </div>

          {error && <div className="text-xs text-banker">{error}</div>}
        </div>
      </section>

      {me && (
        <footer className="flex items-center justify-between px-4 pb-4 text-xs text-cream/50" style={{ paddingBottom: "calc(1rem + var(--safe-bottom))" }}>
          <span>
            登入方式：{me.identities.map((i) => i.provider).join(" · ")}
          </span>
          <div className="flex gap-3">
            <button className="underline" onClick={() => void reload()}>
              重新整理
            </button>
            <button
              className="underline"
              onClick={async () => {
                await logout();
                await reload();
              }}
            >
              登出
            </button>
          </div>
        </footer>
      )}
    </main>
  );
}
