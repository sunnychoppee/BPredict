"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CreateOrderResult, PaymentProviderId, PaymentStatus, PaymentView, ProductView, ShopView, UsdtChain } from "@bpredict/shared";
import { Card, GoldButton, Panel, Pill, fmt, sound } from "@bpredict/ui";
import { AppShell } from "@/components/app-shell";
import { useMe } from "@/components/use-me";
import { api, ApiError } from "@/lib/api";
import { getTelegramWebApp } from "@/lib/telegram";
import { useTable } from "@/lib/table-store";

export default function ShopPage() {
  return (
    <AppShell>
      <Suspense fallback={<Panel className="p-6 text-center text-cream/60">載入中…</Panel>}>
        <ShopView />
      </Suspense>
    </AppShell>
  );
}

const STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: "待付款",
  PAID: "已到帳",
  PARTIALLY_PAID: "部分到帳",
  EXPIRED: "已逾期",
  FAILED: "失敗",
  REFUNDED: "已退款",
};
const PROVIDER_LABEL: Record<PaymentProviderId, string> = { NOWPAYMENTS: "USDT", STRIPE: "信用卡", TELEGRAM_STARS: "Stars", DEV: "測試" };

function ShopView() {
  const { me, loading } = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const pushToast = useTable((s) => s.pushToast);
  const setCoins = useTable((s) => s.setCoins);
  const setGems = useTable((s) => s.setGems);
  const [shop, setShop] = useState<ShopView | null>(null);
  const [orders, setOrders] = useState<PaymentView[]>([]);
  const [picking, setPicking] = useState<ProductView | null>(null);
  const [watching, setWatching] = useState<PaymentView | null>(null);
  const inTelegram = typeof window !== "undefined" && !!getTelegramWebApp();

  const load = useCallback(async () => {
    try {
      const [s, o] = await Promise.all([api<ShopView>("/shop"), api<PaymentView[]>("/shop/orders?limit=10")]);
      setShop(s);
      setOrders(o);
    } catch {
      setShop(null);
    }
  }, []);

  useEffect(() => {
    if (me) void load();
  }, [me, load]);

  // Returning from a hosted checkout: ?order=<id>&result=success|cancel
  useEffect(() => {
    const id = params.get("order");
    if (!id || !me) return;
    void api<PaymentView>(`/shop/orders/${id}`)
      .then((p) => {
        if (p.status === "PENDING" && params.get("result") !== "cancel") setWatching(p);
        else if (p.status === "PAID") celebrate(p);
      })
      .catch(() => undefined)
      .finally(() => router.replace("/shop"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, me]);

  function celebrate(p: PaymentView) {
    sound().play("win");
    const what = p.creditedCoins > 0 ? `${fmt(p.creditedCoins)} 金幣` : p.creditedGems > 0 ? `${fmt(p.creditedGems)} 寶石` : "VIP 月卡";
    pushToast("win", `${p.firstCharge ? "首充雙倍！" : "購買成功！"}已到帳 ${what}`);
    void load();
    // The live balance channel is only open on the table page; refresh the header explicitly.
    void api<{ currency: "COINS" | "GEMS"; amount: number }[]>("/me/balances")
      .then((rows) => {
        for (const r of rows) (r.currency === "COINS" ? setCoins : setGems)(r.amount);
      })
      .catch(() => undefined);
  }

  if (loading) return <Panel className="p-6 text-center text-cream/60">載入中…</Panel>;
  if (!me)
    return (
      <Panel className="p-6 text-center">
        <div className="font-display text-xl text-gold">尚未登入</div>
        <p className="mt-2 text-sm text-cream/70">登入後即可購買金幣包與 VIP 月卡。</p>
        <Link href="/login" className="btn-gold mt-4 inline-block">
          前往登入
        </Link>
      </Panel>
    );
  if (!shop) return <Panel className="p-6 text-center text-cream/60">載入中…</Panel>;

  const coinPacks = shop.products.filter((p) => p.type === "COINS");
  const gemPacks = shop.products.filter((p) => p.type === "GEMS");
  const vip = shop.products.find((p) => p.type === "VIP");
  const enabledChannels = shop.channels.filter((c) => c.enabled && (c.id !== "TELEGRAM_STARS" || inTelegram));

  return (
    <div className="flex flex-col gap-3">
      {shop.firstChargeAvailable && (
        <div className="relative overflow-hidden rounded-xl border border-gold/60 bg-gradient-to-r from-[#5a3a0a] via-[#8a6a25] to-[#5a3a0a] p-3 text-center shadow-[0_0_24px_rgba(232,201,122,.35)]">
          <div className="font-display text-lg text-gold-bright">🎉 首充雙倍</div>
          <div className="text-xs text-cream/85">首次購買任一金幣包，金幣 ×{shop.firstChargeMultiplier}（限一次）</div>
          <div className="pointer-events-none absolute inset-0 animate-shimmer bg-[linear-gradient(110deg,transparent_30%,rgba(255,255,255,.14)_50%,transparent_70%)] bg-[length:200%_100%]" />
        </div>
      )}

      <Panel className="p-4">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-xl text-gold">🪙 金幣包</h1>
          <span className="text-[11px] text-cream/55">1 USDT ＝ 10,000 金幣</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {coinPacks.map((p) => (
            <ProductCard key={p.id} p={p} firstCharge={shop.firstChargeAvailable} mult={shop.firstChargeMultiplier} onBuy={() => setPicking(p)} />
          ))}
        </div>
      </Panel>

      {vip && (
        <Panel className="p-4" id="vip">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl text-gold">👑 VIP 月卡</h2>
            {shop.isVip ? <Pill>VIP 至 {shop.vipExpiresAt ? new Date(shop.vipExpiresAt).toLocaleDateString("zh-TW") : "—"}</Pill> : <Pill tone="void">未開通</Pill>}
          </div>
          <ul className="mt-2 grid gap-1 text-xs text-cream/75 sm:grid-cols-2">
            <li>• 每日額外 {fmt(shop.vipDailyCoins)} 金幣（獎勵頁領取）</li>
            <li>• 單局下注上限提升至 1,000,000</li>
            <li>• 專屬 VIP 稱號</li>
            <li>• 30 天，可疊加續期</li>
          </ul>
          <div className="mt-3 flex items-center justify-between">
            <div className="num text-2xl text-gold-bright">${vip.priceUsdt.toFixed(2)}</div>
            <GoldButton onClick={() => setPicking(vip)}>{shop.isVip ? "續期 30 天" : "開通 VIP"}</GoldButton>
          </div>
        </Panel>
      )}

      <Panel className="p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-gold">💎 寶石</h2>
          <span className="text-[11px] text-cream/55">用於外觀道具（W5 開放）</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {gemPacks.map((p) => (
            <ProductCard key={p.id} p={p} onBuy={() => setPicking(p)} />
          ))}
        </div>
      </Panel>

      {orders.length > 0 && (
        <Panel className="p-4">
          <h2 className="font-display text-lg text-gold">購買紀錄</h2>
          <ul className="mt-2 divide-y divide-gold/10 text-sm">
            {orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="text-cream/90">
                    {o.productName} <span className="text-[10px] text-cream/45">· {PROVIDER_LABEL[o.provider]}{o.chain ? ` ${o.chain}` : ""}</span>
                  </div>
                  <div className="text-[10px] text-cream/45">{new Date(o.createdAt).toLocaleString("zh-TW", { hour12: false })}</div>
                </div>
                <div className="text-right">
                  <Pill tone={o.status === "PAID" ? "gold" : o.status === "PENDING" ? "player" : "void"}>{STATUS_LABEL[o.status]}</Pill>
                  {o.status === "PENDING" && o.payUrl && (
                    <button className="mt-1 block w-full text-[10px] text-gold underline" onClick={() => setWatching(o)}>
                      繼續付款
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <p className="pb-2 text-center text-[10px] text-cream/40">金幣與寶石為虛擬道具，僅供娛樂，不可提現、不可兌換任何實物或虛擬貨幣。虛擬物品售出不退款。</p>

      <AnimatePresence>
        {picking && (
          <ChannelSheet
            product={picking}
            channels={enabledChannels}
            chains={shop.usdtChains}
            inTelegram={inTelegram}
            onClose={() => setPicking(null)}
            onCreated={(r) => {
              setPicking(null);
              if (r.next.kind === "done") {
                celebrate(r.payment);
                return;
              }
              if (r.next.kind === "telegram_invoice") {
                const wa = getTelegramWebApp();
                if (wa?.openInvoice) {
                  wa.openInvoice(r.next.url, (status) => {
                    if (status === "paid") setWatching(r.payment);
                    else if (status === "failed") pushToast("error", "付款失敗");
                  });
                  return;
                }
              }
              // Hosted checkout: open in the same tab (Stripe/NOWPayments redirect back with ?order=).
              setWatching(r.payment);
              window.location.href = r.next.url;
            }}
          />
        )}
        {watching && (
          <OrderWatcher
            order={watching}
            onDone={(p) => {
              setWatching(null);
              if (p.status === "PAID" || p.status === "PARTIALLY_PAID") celebrate(p);
              else void load();
            }}
            onClose={() => {
              setWatching(null);
              void load();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ProductCard({ p, firstCharge, mult, onBuy }: { p: ProductView; firstCharge?: boolean; mult?: number; onBuy: () => void }) {
  const amount = p.type === "COINS" ? p.coins : p.gems;
  const doubled = firstCharge && p.type === "COINS" && mult ? p.coins * mult : null;
  return (
    <button onClick={onBuy} className="group relative flex flex-col items-center rounded-xl border border-gold/30 bg-felt-dark/70 p-3 text-center transition hover:border-gold-bright hover:bg-felt-dark active:translate-y-px">
      {p.bonusPct > 0 && <span className="absolute -top-2 right-2 rounded-full bg-banker px-2 py-0.5 text-[10px] font-bold text-cream shadow">+{p.bonusPct}%</span>}
      <div className="text-2xl">{p.type === "COINS" ? (p.priceUsdt >= 100 ? "💰" : "🪙") : "💎"}</div>
      <div className="num mt-1 text-base text-gold-bright">{fmt(doubled ?? amount)}</div>
      {doubled && <div className="num text-[10px] text-cream/50 line-through">{fmt(amount)}</div>}
      <div className="mt-1 text-[10px] text-cream/60">{p.type === "COINS" ? "金幣" : "寶石"}</div>
      <div className="mt-2 w-full rounded-md bg-gradient-to-b from-gold-bright to-gold py-1 text-sm font-semibold text-felt-dark group-hover:brightness-110">${p.priceUsdt.toFixed(2)}</div>
    </button>
  );
}

function ChannelSheet({
  product,
  channels,
  chains,
  inTelegram,
  onClose,
  onCreated,
}: {
  product: ProductView;
  channels: ShopView["channels"];
  chains: readonly UsdtChain[];
  inTelegram: boolean;
  onClose: () => void;
  onCreated: (r: CreateOrderResult) => void;
}) {
  const pushToast = useTable((s) => s.pushToast);
  const [provider, setProvider] = useState<PaymentProviderId | null>(channels[0]?.id ?? null);
  const [chain, setChain] = useState<UsdtChain>("TRC20");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!provider || busy) return;
    setBusy(true);
    try {
      const r = await api<CreateOrderResult>("/shop/orders", {
        method: "POST",
        body: JSON.stringify({ productId: product.id, provider, ...(provider === "NOWPAYMENTS" ? { chain } : {}) }),
      });
      onCreated(r);
    } catch (e) {
      pushToast("error", e instanceof ApiError ? e.message : "下單失敗，請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose} title={`購買 ${product.name}`}>
      <div className="flex items-center justify-between rounded-lg border border-gold/25 bg-felt-dark/60 px-3 py-2 text-sm">
        <span className="text-cream/80">{product.name}</span>
        <span className="num text-gold-bright">
          ${product.priceUsdt.toFixed(2)}
          {provider === "TELEGRAM_STARS" && <span className="ml-1 text-xs text-cream/60">≈ {product.priceStars} ⭐</span>}
        </span>
      </div>

      {channels.length === 0 ? (
        <p className="mt-4 text-center text-sm text-cream/60">{inTelegram ? "目前沒有可用的支付渠道。" : "目前沒有可用的支付渠道，請稍後再試。"}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {channels.map((c) => (
            <button
              key={c.id}
              onClick={() => setProvider(c.id)}
              className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                provider === c.id ? "border-gold-bright bg-gold/15 text-gold-bright" : "border-gold/25 bg-felt-dark/60 text-cream/85 hover:border-gold/60"
              }`}
            >
              <span>
                {c.id === "NOWPAYMENTS" ? "🪙 " : c.id === "STRIPE" ? "💳 " : c.id === "TELEGRAM_STARS" ? "⭐ " : "🧪 "}
                {c.label}
              </span>
              {c.note && <span className="text-[10px] text-cream/50">{c.note}</span>}
            </button>
          ))}
          {provider === "NOWPAYMENTS" && (
            <div className="mt-1 flex gap-2">
              {chains.map((ch) => (
                <button
                  key={ch}
                  onClick={() => setChain(ch)}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-xs ${chain === ch ? "border-gold-bright bg-gold/15 text-gold-bright" : "border-gold/25 text-cream/75"}`}
                >
                  USDT-{ch}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <GoldButton className="mt-4 w-full" disabled={!provider || busy} onClick={() => void submit()}>
        {busy ? "建立訂單中…" : provider === "DEV" ? "測試購買（立即到帳）" : "前往付款"}
      </GoldButton>
      <p className="mt-2 text-center text-[10px] text-cream/40">付款完成後金幣自動到帳，通常在 1 分鐘內。</p>
    </Sheet>
  );
}

/** Polls an order until it leaves PENDING (or the user closes the sheet). */
function OrderWatcher({ order, onDone, onClose }: { order: PaymentView; onDone: (p: PaymentView) => void; onClose: () => void }) {
  const [p, setP] = useState(order);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    let delay = 2000;
    const poll = async () => {
      try {
        const next = await api<PaymentView>(`/shop/orders/${order.id}`);
        if (!alive) return;
        setP(next);
        if (next.status !== "PENDING") {
          onDone(next);
          return;
        }
      } catch {
        /* retry */
      }
      delay = Math.min(delay * 1.3, 10_000);
      timer.current = setTimeout(poll, delay);
    };
    timer.current = setTimeout(poll, 1500);
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  return (
    <Sheet onClose={onClose} title="等待付款確認">
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-gold/30 border-t-gold-bright" />
        <div className="text-sm text-cream/85">
          {p.productName} · ${p.priceUsdt.toFixed(2)} · {PROVIDER_LABEL[p.provider]}
          {p.chain ? ` ${p.chain}` : ""}
        </div>
        <div className="text-xs text-cream/55">付款完成後會自動到帳，可先關閉此視窗繼續遊戲。</div>
        {p.payUrl && (
          <a href={p.payUrl} target="_blank" rel="noreferrer" className="btn-outline text-sm">
            重新開啟付款頁
          </a>
        )}
      </div>
    </Sheet>
  );
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="felt-surface gold-frame w-full max-w-md rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:rounded-2xl"
        initial={{ y: 60 }}
        animate={{ y: 0 }}
        exit={{ y: 60 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="font-display text-lg text-gold">{title}</div>
          <button onClick={onClose} className="text-cream/60 hover:text-cream" aria-label="關閉">
            ✕
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </motion.div>
    </motion.div>
  );
}
