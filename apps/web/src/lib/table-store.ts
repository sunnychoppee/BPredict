"use client";

import { create } from "zustand";
import { TABLE_ID_BTC, type EconomyPublic, type PriceTick, type RoundResult, type RoundView, type ServerEvent, type Side } from "@bpredict/shared";
import { sound } from "@bpredict/ui";
import { api } from "./api";
import { useAuth } from "./auth-store";

export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3002";
const MAX_TICKS = 720;

export interface Toast {
  id: number;
  kind: "win" | "lose" | "void" | "info" | "error";
  text: string;
}

export interface MyBet {
  id: string;
  side: Side;
  amount: number;
  createdAt: number;
}

export type SettledEvent = Extract<ServerEvent, { t: "round.settled" }>;
export type PayoutEvent = Extract<ServerEvent, { t: "user.payout" }>;

interface TableState {
  connected: boolean;
  serverOffset: number;
  betting: RoundView | null;
  locked: RoundView | null;
  price: PriceTick | null;
  ticks: PriceTick[];
  results: RoundResult[];
  coins: number | null;
  gems: number | null;
  economy: EconomyPublic | null;
  myBets: MyBet[];
  /** Stakes of the last round I bet on (for 重複). */
  lastRoundBets: { side: Side; amount: number }[];
  settled: { ev: SettledEvent; payout: PayoutEvent | null; at: number } | null;
  lastPayout: PayoutEvent | null;
  toasts: Toast[];

  connect(tableId?: string): void;
  disconnect(): void;
  now(): number;
  pushToast(kind: Toast["kind"], text: string): void;
  dismissToast(id: number): void;
  setCoins(n: number | null): void;
  setGems(n: number | null): void;
  loadEconomy(): Promise<void>;
  refreshMyBets(): Promise<void>;
  clearSettled(): void;
}

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let backoff = 1000;
let toastSeq = 1;
let desiredTable = TABLE_ID_BTC;
let pendingPayout: PayoutEvent | null = null;

export const useTable = create<TableState>()((set, get) => ({
  connected: false,
  serverOffset: 0,
  betting: null,
  locked: null,
  price: null,
  ticks: [],
  results: [],
  coins: null,
  gems: null,
  economy: null,
  myBets: [],
  lastRoundBets: [],
  settled: null,
  lastPayout: null,
  toasts: [],

  now: () => Date.now() + get().serverOffset,
  setCoins: (n) => set({ coins: n }),
  setGems: (n) => set({ gems: n }),
  clearSettled: () => set({ settled: null }),
  pushToast: (kind, text) => {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
    setTimeout(() => get().dismissToast(id), kind === "win" ? 7000 : 4500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  loadEconomy: async () => {
    try {
      set({ economy: await api<EconomyPublic>("/economy") });
    } catch {
      /* keep defaults */
    }
  },

  refreshMyBets: async () => {
    const id = get().betting?.id;
    if (!id || !useAuth.getState().accessToken) return set({ myBets: [] });
    try {
      set({ myBets: await api<MyBet[]>(`/rounds/${id}/bets/me`) });
    } catch {
      set({ myBets: [] });
    }
  },

  disconnect: () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    socket?.close();
    socket = null;
    set({ connected: false });
  },

  connect: (tableId = TABLE_ID_BTC) => {
    desiredTable = tableId;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
    const token = useAuth.getState().accessToken;
    const url = new URL(WS_URL);
    url.searchParams.set("table", tableId);
    if (token) url.searchParams.set("token", token);

    const ws = new WebSocket(url.toString());
    socket = ws;
    ws.onopen = () => {
      backoff = 1000;
      set({ connected: true });
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      set({ connected: false });
      reconnectTimer = setTimeout(() => get().connect(desiredTable), backoff);
      backoff = Math.min(backoff * 2, 15_000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (m) => {
      let ev: ServerEvent;
      try {
        ev = JSON.parse(m.data as string) as ServerEvent;
      } catch {
        return;
      }
      handle(ev);
    };

    function handle(ev: ServerEvent) {
      const s = get();
      switch (ev.t) {
        case "hello":
        case "pong":
          set({ serverOffset: ev.serverTime - Date.now() });
          break;
        case "snapshot": {
          const prevBetting = s.betting?.id;
          set({ betting: ev.betting, locked: ev.locked, price: ev.price ?? s.price, ticks: ev.ticks?.length ? ev.ticks : s.ticks, results: ev.results, serverOffset: ev.serverTime - Date.now() });
          if (ev.betting?.id !== prevBetting) void get().refreshMyBets();
          break;
        }
        case "round.state": {
          const prevBetting = s.betting?.id;
          const betting =
            ev.betting && s.betting?.id === ev.betting.id && ev.betting.poolBanker + ev.betting.poolPlayer === 0
              ? { ...ev.betting, poolBanker: s.betting.poolBanker, poolPlayer: s.betting.poolPlayer }
              : ev.betting;
          set({ betting, locked: ev.locked, serverOffset: ev.serverTime - Date.now() });
          if (ev.betting?.id !== prevBetting) {
            if (prevBetting && s.myBets.length) set({ lastRoundBets: summarise(s.myBets) });
            set({ myBets: [] });
            void get().refreshMyBets();
          }
          break;
        }
        case "pool.update":
          if (s.betting && s.betting.id === ev.roundId) set({ betting: { ...s.betting, poolBanker: ev.poolBanker, poolPlayer: ev.poolPlayer } });
          break;
        case "price.tick": {
          const tick = { price: ev.price, source: ev.source, ts: ev.ts };
          const ticks = s.ticks.length >= MAX_TICKS ? [...s.ticks.slice(-MAX_TICKS + 1), tick] : [...s.ticks, tick];
          set({ price: tick, ticks });
          break;
        }
        case "round.locked": {
          if (s.betting && s.betting.id === ev.roundId) {
            if (s.myBets.length) set({ lastRoundBets: summarise(s.myBets) });
            set({ locked: { ...s.betting, status: "LOCKED", lockPrice: ev.lockPrice }, betting: null, myBets: [] });
          }
          sound().play("lock");
          break;
        }
        case "round.settled": {
          const l = s.locked;
          const res: RoundResult = { roundNo: ev.roundNo, winner: ev.winner, lockPrice: ev.lockPrice, closePrice: ev.closePrice, closeAt: l?.closeAt ?? s.now() };
          const payout = pendingPayout?.roundId === ev.roundId ? pendingPayout : null;
          pendingPayout = null;
          set({ results: [...s.results.slice(-199), res], locked: l && l.id === ev.roundId ? null : l, settled: { ev, payout, at: Date.now() } });
          if (!payout) sound().play(ev.winner ? "lock" : "void");
          setTimeout(() => {
            if (get().settled?.ev.roundId === ev.roundId) set({ settled: null });
          }, 5000);
          break;
        }
        case "user.balance":
          if (ev.currency === "COINS") set({ coins: ev.amount });
          else if (ev.currency === "GEMS") set({ gems: ev.amount });
          break;
        case "user.payout": {
          set({ lastPayout: ev });
          // settled event for the table may arrive just after; attach payout to the overlay either way
          const cur = get().settled;
          if (cur && cur.ev.roundId === ev.roundId) set({ settled: { ...cur, payout: ev } });
          else pendingPayout = ev;
          const f = (n: number) => n.toLocaleString("en-US");
          if (ev.won) {
            sound().play("win");
            get().pushToast("win", `第 ${ev.roundNo} 局 贏 +${f(ev.payout)}${ev.streakBonus ? `（含連勝加成 ${f(ev.streakBonus)}）` : ""}${ev.streak >= 3 ? ` · ${ev.streak} 連勝` : ""}`);
          } else if (ev.payout === ev.stake) {
            sound().play("void");
            get().pushToast("void", `第 ${ev.roundNo} 局 和局 / 無效，已退還 ${f(ev.stake)}`);
          } else {
            sound().play("lose");
            get().pushToast("lose", `第 ${ev.roundNo} 局 未中，-${f(ev.stake)}`);
          }
          break;
        }
        case "announce":
          get().pushToast("info", ev.text);
          break;
        case "error":
          get().pushToast("error", ev.message);
          break;
      }
    }
  },
}));

function summarise(bets: MyBet[]): { side: Side; amount: number }[] {
  const m = new Map<Side, number>();
  for (const b of bets) m.set(b.side, (m.get(b.side) ?? 0) + b.amount);
  return [...m.entries()].map(([side, amount]) => ({ side, amount }));
}

let lastToken: string | null | undefined;
useAuth.subscribe((s) => {
  if (s.accessToken === lastToken) return;
  lastToken = s.accessToken;
  const t = useTable.getState();
  if (socket) {
    t.disconnect();
    t.connect(desiredTable);
  }
  void t.refreshMyBets();
});

// ---- REST helpers ----

export const placeBet = (roundId: string, side: Side, amount: number) =>
  api<{ id: string; side: Side; amount: number; created: boolean }>(`/rounds/${roundId}/bets`, {
    method: "POST",
    body: JSON.stringify({ side, amount, nonce: crypto.randomUUID() }),
  });

export const cancelBets = (roundId: string) => api<{ cancelled: number; refunded: number }>(`/rounds/${roundId}/bets`, { method: "DELETE" });
