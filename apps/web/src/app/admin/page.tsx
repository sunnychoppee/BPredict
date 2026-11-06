"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { AdminActionRow, AdminLedgerRow, AdminOverview, AdminPaymentRow, AdminRoundRow, AdminUserRow } from "@bpredict/shared";
import { Card, GoldButton, Panel, Pill, fmt, fmtPx } from "@bpredict/ui";
import { AppShell } from "@/components/app-shell";
import { useMe } from "@/components/use-me";
import { api, ApiError } from "@/lib/api";
import { fmtDateTime, useLocale } from "@/lib/i18n";
import { useTable } from "@/lib/table-store";

type Tab = "overview" | "economy" | "products" | "users" | "payments" | "rounds" | "actions";
const TABS: Tab[] = ["overview", "economy", "products", "users", "payments", "rounds", "actions"];

export default function AdminPage() {
  return (
    <AppShell wide>
      <Admin />
    </AppShell>
  );
}

function useErr() {
  const pushToast = useTable((s) => s.pushToast);
  const tc = useTranslations("common");
  return (e: unknown) => pushToast("error", e instanceof ApiError ? e.message : tc("error"));
}

function Admin() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const { me, loading } = useMe();
  const [tab, setTab] = useState<Tab>("overview");

  if (loading) return <Panel className="p-6 text-center text-cream/60">{tc("loading")}</Panel>;
  if (!me?.isAdmin)
    return (
      <Panel className="p-6 text-center">
        <div className="font-display text-xl text-gold">{t("title")}</div>
        <p className="mt-2 text-sm text-cream/70">{t("forbidden")}</p>
        <Link href={me ? "/me" : "/login"} className="btn-outline mt-4 inline-block text-sm">
          {me ? "← /me" : tc("goLogin")}
        </Link>
      </Panel>
    );

  return (
    <div className="flex flex-col gap-3">
      <Panel className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-xl text-gold">{t("title")}</h1>
          <div className="flex flex-wrap gap-1 text-xs">
            {TABS.map((k) => (
              <button key={k} onClick={() => setTab(k)} className={`rounded-md px-2.5 py-1 ${tab === k ? "bg-gold text-felt-dark" : "text-cream/70 hover:text-gold-bright"}`}>
                {t(k)}
              </button>
            ))}
          </div>
        </div>
      </Panel>
      {tab === "overview" && <Overview />}
      {tab === "economy" && <Economy />}
      {tab === "products" && <Products />}
      {tab === "users" && <Users />}
      {tab === "payments" && <Payments />}
      {tab === "rounds" && <Rounds />}
      {tab === "actions" && <Actions />}
    </div>
  );
}

// ---------------------------------------------------------------- overview

function Overview() {
  const [o, setO] = useState<AdminOverview | null>(null);
  const err = useErr();
  useEffect(() => {
    api<AdminOverview>("/admin/overview").then(setO).catch(err);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!o) return <Panel className="p-6 text-center text-cream/60">…</Panel>;
  const S = ({ k, v, tone }: { k: string; v: string | number; tone?: string }) => (
    <Card className="p-3">
      <div className="text-[11px] text-cream/55">{k}</div>
      <div className={`num text-xl ${tone ?? "text-cream"}`}>{typeof v === "number" ? fmt(v) : v}</div>
    </Card>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <S k="Users" v={o.users.total} />
      <S k="New today" v={o.users.newToday} />
      <S k="Active today (bettors)" v={o.users.activeToday} />
      <S k="VIP / Frozen" v={`${o.users.vip} / ${o.users.frozen}`} />
      <S k="Coins circulating" v={o.coins.circulating} tone="text-gold-bright" />
      <S k="Coins issued today (non-payout)" v={o.coins.issuedToday} />
      <S k="Coins recovered today (fee+destroyed)" v={o.coins.recoveredToday} />
      <S k="Fee today" v={o.rounds.feeToday} />
      <S k="Rounds settled / voided today" v={`${o.rounds.settledToday} / ${o.rounds.voidedToday}`} />
      <S k="Staked today" v={o.rounds.stakedToday} />
      <S k="Payments today" v={`${o.payments.paidToday} · $${o.payments.usdtToday.toFixed(2)}`} tone="text-emerald-300" />
      <S k="Payments total · pending" v={`${o.payments.paidTotal} · $${o.payments.usdtTotal.toFixed(2)} · ${o.payments.pending} pending`} />
    </div>
  );
}

// ---------------------------------------------------------------- economy

interface EcoRow {
  key: string;
  value: unknown;
  default: unknown;
  updatedAt: string | null;
}

function Economy() {
  const t = useTranslations("admin");
  const [rows, setRows] = useState<EcoRow[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const err = useErr();
  const pushToast = useTable((s) => s.pushToast);
  const load = useCallback(() => api<EcoRow[]>("/admin/economy").then(setRows).catch(err), [err]);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(key: string, raw: string) {
    try {
      const value = JSON.parse(raw) as unknown;
      await api("/admin/economy", { method: "PUT", body: JSON.stringify({ key, value }) });
      pushToast("info", `${key} ${t("done")}`);
      setDraft((d) => ({ ...d, [key]: "" }));
      void load();
    } catch (e) {
      if (e instanceof SyntaxError) pushToast("error", "invalid JSON");
      else err(e);
    }
  }

  return (
    <Panel className="p-3">
      <ul className="divide-y divide-gold/10 text-sm">
        {rows.map((r) => {
          const cur = JSON.stringify(r.value);
          const def = JSON.stringify(r.default);
          const val = draft[r.key] ?? "";
          return (
            <li key={r.key} className="grid gap-2 py-2 sm:grid-cols-[14rem_1fr_auto] sm:items-center">
              <div>
                <div className="font-mono text-xs text-gold-bright">{r.key}</div>
                <div className="text-[10px] text-cream/45">
                  {t("default")}: <span className="font-mono">{def}</span>
                  {cur !== def && <span className="ml-1 text-banker">●</span>}
                </div>
              </div>
              <input className="input py-1 font-mono text-xs" placeholder={cur} value={val} onChange={(e) => setDraft((d) => ({ ...d, [r.key]: e.target.value }))} />
              <div className="flex gap-1">
                <GoldButton className="px-2 py-1 text-xs" disabled={!val} onClick={() => void save(r.key, val)}>
                  {t("apply")}
                </GoldButton>
                {cur !== def && (
                  <GoldButton variant="ghost" className="px-2 py-1 text-xs" onClick={() => void save(r.key, def)}>
                    {t("reset")}
                  </GoldButton>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

// ---------------------------------------------------------------- products

interface ProductRow {
  id: string;
  type: string;
  name: string;
  priceUsdt: number;
  priceStars: number;
  coins: number;
  gems: number;
  bonusPct: number;
  vipDays: number;
  sortOrder: number;
  enabled: boolean;
}

function Products() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const err = useErr();
  const load = useCallback(() => api<ProductRow[]>("/admin/products").then(setRows).catch(err), [err]);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function patch(id: string, body: Partial<ProductRow>) {
    try {
      await api(`/admin/products/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      void load();
    } catch (e) {
      err(e);
    }
  }
  return (
    <Panel className="overflow-x-auto p-3">
      <table className="w-full text-left text-xs">
        <thead className="text-cream/50">
          <tr>
            <th className="py-1">id</th>
            <th>name</th>
            <th>USDT</th>
            <th>⭐</th>
            <th>coins / gems / vip</th>
            <th>bonus</th>
            <th>enabled</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gold/10">
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="py-1.5 font-mono text-gold-bright">{p.id}</td>
              <td>{p.name}</td>
              <td>
                <InlineNum value={p.priceUsdt} onSave={(v) => void patch(p.id, { priceUsdt: v })} step="0.01" />
              </td>
              <td>
                <InlineNum value={p.priceStars} onSave={(v) => void patch(p.id, { priceStars: v })} />
              </td>
              <td className="num">
                {fmt(p.coins)} / {p.gems} / {p.vipDays}d
              </td>
              <td>{p.bonusPct}%</td>
              <td>
                <button onClick={() => void patch(p.id, { enabled: !p.enabled })} className={`rounded px-2 py-0.5 ${p.enabled ? "bg-emerald-700/50 text-emerald-200" : "bg-void/40 text-cream/60"}`}>
                  {p.enabled ? "on" : "off"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function InlineNum({ value, onSave, step = "1" }: { value: number; onSave: (v: number) => void; step?: string }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <input
      className="input w-20 py-0.5 text-xs"
      type="number"
      step={step}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = Number(v);
        if (Number.isFinite(n) && n !== value) onSave(n);
      }}
    />
  );
}

// ---------------------------------------------------------------- users

function Users() {
  const t = useTranslations("admin");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [sel, setSel] = useState<AdminUserRow | null>(null);
  const err = useErr();
  const search = useCallback(
    (term: string) =>
      api<AdminUserRow[]>(`/admin/users?q=${encodeURIComponent(term)}`)
        .then(setRows)
        .catch(err),
    [err],
  );
  useEffect(() => {
    void search("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
      <Panel className="p-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void search(q);
          }}
        >
          <input className="input flex-1 py-1 text-sm" placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
          <GoldButton className="px-3 py-1 text-xs">🔍</GoldButton>
        </form>
        <ul className="mt-2 divide-y divide-gold/10 text-sm">
          {rows.map((u) => (
            <li key={u.id} className={`cursor-pointer rounded px-2 py-2 hover:bg-gold/10 ${sel?.id === u.id ? "bg-gold/10" : ""}`} onClick={() => setSel(u)}>
              <div className="flex items-center gap-2">
                <span className="truncate text-cream">{u.nickname}</span>
                {u.isVip && <Pill>VIP</Pill>}
                {u.frozenAt && <Pill tone="void">{t("frozen")}</Pill>}
                <span className="num ml-auto text-gold-bright">🪙 {fmt(u.balances[0]?.amount ?? 0)}</span>
              </div>
              <div className="truncate text-[10px] text-cream/45">{u.identities.map((i) => `${i.provider}:${i.email ?? i.providerUid}`).join(" · ")}</div>
            </li>
          ))}
        </ul>
      </Panel>
      {sel && (
        <UserDetail
          user={sel}
          onChange={async () => {
            const u = await api<AdminUserRow>(`/admin/users/${sel.id}`);
            setSel(u);
            void search(q);
          }}
        />
      )}
    </div>
  );
}

function UserDetail({ user: u, onChange }: { user: AdminUserRow; onChange: () => Promise<void> }) {
  const t = useTranslations("admin");
  const locale = useLocale((s) => s.locale);
  const err = useErr();
  const pushToast = useTable((s) => s.pushToast);
  const [ledger, setLedger] = useState<AdminLedgerRow[]>([]);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"COINS" | "GEMS">("COINS");
  const [reason, setReason] = useState("");
  const [vipDays, setVipDays] = useState("30");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<AdminLedgerRow[]>(`/admin/users/${u.id}/ledger?limit=30`).then(setLedger).catch(err);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [u.id, u.balances]);

  async function run(path: string, body: unknown) {
    if (busy) return;
    setBusy(true);
    try {
      await api(`/admin/users/${u.id}/${path}`, { method: "POST", body: JSON.stringify(body) });
      pushToast("info", t("done"));
      await onChange();
    } catch (e) {
      err(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="p-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-display text-lg text-gold-bright">{u.nickname}</span>
        {u.isVip && <Pill>VIP {u.vipExpiresAt ? `→ ${fmtDateTime(u.vipExpiresAt, locale)}` : ""}</Pill>}
        {u.frozenAt && <Pill tone="void">{t("frozen")}</Pill>}
      </div>
      <div className="mt-1 font-mono text-[10px] text-cream/45">{u.id}</div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        {u.balances.map((b) => (
          <Card key={b.currency} className="p-2">
            <div className="text-[10px] text-cream/50">{b.currency}</div>
            <div className="num text-base">{fmt(b.amount)}</div>
          </Card>
        ))}
        <Card className="p-2">
          <div className="text-[10px] text-cream/50">paid USDT</div>
          <div className="num text-base">${u.paidUsdt.toFixed(2)}</div>
        </Card>
      </div>
      {u.stats && (
        <div className="mt-2 text-[11px] text-cream/60">
          rounds {u.stats.totalRounds} · wins {u.stats.wins} · streak {u.stats.currentStreak}/{u.stats.maxStreak} · net {u.stats.netProfit >= 0 ? "+" : ""}
          {fmt(u.stats.netProfit)}
        </div>
      )}

      <div className="mt-3 rounded-lg border border-gold/20 p-2">
        <div className="text-xs text-gold">{t("adjust")}</div>
        <div className="mt-1 flex flex-wrap gap-2">
          <select className="input w-24 py-1 text-xs" value={currency} onChange={(e) => setCurrency(e.target.value as "COINS" | "GEMS")}>
            <option value="COINS">COINS</option>
            <option value="GEMS">GEMS</option>
          </select>
          <input className="input w-32 py-1 text-xs" type="number" placeholder={t("amount")} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input className="input flex-1 py-1 text-xs" placeholder={t("reason")} value={reason} onChange={(e) => setReason(e.target.value)} />
          <GoldButton className="px-3 py-1 text-xs" disabled={busy || !amount || reason.length < 2} onClick={() => void run("adjust", { currency, amount: Number(amount), reason })}>
            {t("apply")}
          </GoldButton>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <input className="input w-24 py-1 text-xs" type="number" placeholder={t("vipDays")} value={vipDays} onChange={(e) => setVipDays(e.target.value)} />
        <GoldButton variant="outline" className="px-3 py-1 text-xs" disabled={busy || reason.length < 2} onClick={() => void run("vip", { days: Number(vipDays), reason })}>
          {t("grantVip")}
        </GoldButton>
        <GoldButton variant="outline" className="ml-auto px-3 py-1 text-xs" disabled={busy || reason.length < 2} onClick={() => void run("freeze", { frozen: !u.frozenAt, reason })}>
          {u.frozenAt ? t("unfreeze") : t("freeze")}
        </GoldButton>
      </div>
      <div className="mt-1 text-[10px] text-cream/40">↑ {t("reason")} *</div>

      <div className="mt-3 text-xs text-gold">{t("ledger")}</div>
      <ul className="mt-1 max-h-72 divide-y divide-gold/10 overflow-y-auto text-xs">
        {ledger.map((l) => (
          <li key={l.id} className="flex items-center justify-between py-1">
            <span>
              {l.type} <span className="text-cream/40">{l.refType ? `${l.refType}:${l.refId?.slice(0, 8)}` : ""}</span>
              <div className="text-[10px] text-cream/40">{fmtDateTime(l.createdAt, locale)}</div>
            </span>
            <span className="text-right">
              <div className={`num ${l.amount >= 0 ? "text-pos" : "text-neg"}`}>
                {l.amount >= 0 ? "+" : ""}
                {fmt(l.amount)} {l.currency === "GEMS" ? "💎" : ""}
              </div>
              <div className="num text-[10px] text-cream/40">= {fmt(l.balanceAfter)}</div>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ---------------------------------------------------------------- payments / rounds / actions

function Payments() {
  const locale = useLocale((s) => s.locale);
  const [rows, setRows] = useState<AdminPaymentRow[]>([]);
  const [status, setStatus] = useState("");
  const err = useErr();
  useEffect(() => {
    api<AdminPaymentRow[]>(`/admin/payments?limit=100${status ? `&status=${status}` : ""}`).then(setRows).catch(err);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  return (
    <Panel className="overflow-x-auto p-3">
      <div className="flex gap-1 text-xs">
        {["", "PENDING", "PAID", "PARTIALLY_PAID", "EXPIRED", "FAILED"].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`rounded px-2 py-0.5 ${status === s ? "bg-gold text-felt-dark" : "text-cream/60"}`}>
            {s || "all"}
          </button>
        ))}
      </div>
      <table className="mt-2 w-full text-left text-xs">
        <thead className="text-cream/50">
          <tr>
            <th className="py-1">time</th>
            <th>user</th>
            <th>product</th>
            <th>provider</th>
            <th>status</th>
            <th>USDT</th>
            <th>credited</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gold/10">
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="py-1 text-cream/60">{fmtDateTime(p.createdAt, locale)}</td>
              <td>{p.nickname}</td>
              <td className="font-mono">{p.productId}</td>
              <td>
                {p.provider}
                {p.chain ? ` ${p.chain}` : ""}
              </td>
              <td>
                <Pill tone={p.status === "PAID" ? "gold" : p.status === "PENDING" ? "player" : "void"}>{p.status}</Pill>
              </td>
              <td className="num">
                {p.paidAmount != null ? `$${p.paidAmount.toFixed(2)}` : "—"} / ${p.priceUsdt.toFixed(2)}
              </td>
              <td className="num">
                {fmt(p.creditedCoins)}
                {p.creditedGems ? ` / ${p.creditedGems}💎` : ""}
                {p.firstCharge ? " ×2" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function Rounds() {
  const locale = useLocale((s) => s.locale);
  const [rows, setRows] = useState<AdminRoundRow[]>([]);
  const err = useErr();
  useEffect(() => {
    api<AdminRoundRow[]>("/admin/rounds?limit=100").then(setRows).catch(err);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Panel className="overflow-x-auto p-3">
      <table className="w-full text-left text-xs">
        <thead className="text-cream/50">
          <tr>
            <th className="py-1">#</th>
            <th>close</th>
            <th>status</th>
            <th>lock → close</th>
            <th>B / P pools</th>
            <th>bettors</th>
            <th>fee</th>
            <th>destroyed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gold/10">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="num py-1">{r.roundNo}</td>
              <td className="text-cream/60">{fmtDateTime(r.closeAt, locale)}</td>
              <td>
                <span className={r.winner === "BANKER" ? "text-banker" : r.winner === "PLAYER" ? "text-player" : "text-void"}>{r.status === "VOIDED" ? `VOID ${r.voidReason ?? ""}` : r.winner}</span>
              </td>
              <td className="num">
                {fmtPx(r.lockPrice)} → {fmtPx(r.closePrice)}
              </td>
              <td className="num">
                <span className="text-banker">{fmt(r.poolBanker)}</span> / <span className="text-player">{fmt(r.poolPlayer)}</span>
              </td>
              <td className="num">{r.bettors}</td>
              <td className="num">{fmt(r.fee)}</td>
              <td className="num">{fmt(r.destroyed)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function Actions() {
  const locale = useLocale((s) => s.locale);
  const [rows, setRows] = useState<AdminActionRow[]>([]);
  const err = useErr();
  useEffect(() => {
    api<AdminActionRow[]>("/admin/actions?limit=100").then(setRows).catch(err);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Panel className="p-3">
      <ul className="divide-y divide-gold/10 text-xs">
        {rows.map((a) => (
          <li key={a.id} className="py-1.5">
            <div>
              <span className="text-cream/50">{fmtDateTime(a.createdAt, locale)}</span> · <span className="text-gold-bright">{a.adminNickname}</span> · <b>{a.action}</b>{" "}
              <span className="font-mono text-cream/60">
                {a.targetType}:{a.targetId}
              </span>
            </div>
            <div className="font-mono text-[10px] text-cream/45">{JSON.stringify(a.payload)}</div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
