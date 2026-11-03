"use client";

import { create } from "zustand";
import { TABLE_ID_BTC, type PriceTick, type RoundResult, type RoundView, type ServerEvent } from "@bpredict/shared";
import { API_URL, api } from "./api";
import { useAuth } from "./auth-store";

export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3002";

export interface Toast {
  id: number;
  kind: "win" | "lose" | "void" | "info" | "error";
  text: string;
}

interface TableState {
  connected: boolean;
  serverOffset: number; // serverTime - Date.now()
  betting: RoundView | null;
  locked: RoundView | null;
  price: PriceTick | null;
  results: RoundResult[];
  coins: number | null;
  toasts: Toast[];
  lastPayout: Extract<ServerEvent, { t: "user.payout" }> | null;

  connect(tableId?: string): void;
  disconnect(): void;
  now(): number;
  pushToast(kind: Toast["kind"], text: string): void;
  dismissToast(id: number): void;
  setCoins(n: number | null): void;
}

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let backoff = 1000;
let toastSeq = 1;
let desiredTable = TABLE_ID_BTC;

export const useTable = create<TableState>()((set, get) => ({
  connected: false,
  serverOffset: 0,
  betting: null,
  locked: null,
  price: null,
  results: [],
  coins: null,
  toasts: [],
  lastPayout: null,

  now: () => Date.now() + get().serverOffset,
  setCoins: (n) => set({ coins: n }),
  pushToast: (kind, text) => {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
    setTimeout(() => get().dismissToast(id), kind === "win" ? 7000 : 4500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

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
      switch (ev.t) {
        case "hello":
        case "pong":
          set({ serverOffset: ev.serverTime - Date.now() });
          break;
        case "snapshot":
          set({ betting: ev.betting, locked: ev.locked, price: ev.price ?? get().price, results: ev.results, serverOffset: ev.serverTime - Date.now() });
          break;
        case "round.state": {
          const prev = get();
          // keep live pools we already have if the state frame carries zeros for the same round
          const betting =
            ev.betting && prev.betting?.id === ev.betting.id && ev.betting.poolBanker + ev.betting.poolPlayer === 0
              ? { ...ev.betting, poolBanker: prev.betting.poolBanker, poolPlayer: prev.betting.poolPlayer }
              : ev.betting;
          set({ betting, locked: ev.locked, serverOffset: ev.serverTime - Date.now() });
          break;
        }
        case "pool.update": {
          const b = get().betting;
          if (b && b.id === ev.roundId) set({ betting: { ...b, poolBanker: ev.poolBanker, poolPlayer: ev.poolPlayer } });
          break;
        }
        case "price.tick":
          set({ price: { price: ev.price, source: ev.source, ts: ev.ts } });
          break;
        case "round.locked": {
          const b = get().betting;
          if (b && b.id === ev.roundId) set({ locked: { ...b, status: "LOCKED", lockPrice: ev.lockPrice }, betting: null });
          break;
        }
        case "round.settled": {
          const l = get().locked;
          const res: RoundResult = { roundNo: ev.roundNo, winner: ev.winner, lockPrice: ev.lockPrice, closePrice: ev.closePrice, closeAt: l?.closeAt ?? get().now() };
          set((s) => ({ results: [...s.results.slice(-199), res], locked: l && l.id === ev.roundId ? null : l }));
          break;
        }
        case "user.balance":
          if (ev.currency === "COINS") set({ coins: ev.amount });
          break;
        case "user.payout": {
          set({ lastPayout: ev });
          const fmt = (n: number) => n.toLocaleString("en-US");
          if (ev.won) get().pushToast("win", `第 ${ev.roundNo} 局 贏 +${fmt(ev.payout)}${ev.streakBonus ? `（含連勝加成 ${fmt(ev.streakBonus)}）` : ""}${ev.streak >= 3 ? ` · ${ev.streak} 連勝` : ""}`);
          else if (ev.payout === ev.stake) get().pushToast("void", `第 ${ev.roundNo} 局 和局 / 無效，已退還 ${fmt(ev.stake)}`);
          else get().pushToast("lose", `第 ${ev.roundNo} 局 未中，-${fmt(ev.stake)}`);
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

/** Re-connect the socket when the auth token changes so per-user events are routed. */
let lastToken: string | null | undefined;
useAuth.subscribe((s) => {
  if (s.accessToken === lastToken) return;
  lastToken = s.accessToken;
  const t = useTable.getState();
  if (socket) {
    t.disconnect();
    t.connect(desiredTable);
  }
});

// ---- REST helpers ----

export interface MyBet {
  id: string;
  side: "BANKER" | "PLAYER";
  amount: number;
  createdAt: number;
}

export const placeBet = (roundId: string, side: "BANKER" | "PLAYER", amount: number) =>
  api<{ id: string; side: "BANKER" | "PLAYER"; amount: number; created: boolean }>(`/rounds/${roundId}/bets`, {
    method: "POST",
    body: JSON.stringify({ side, amount, nonce: crypto.randomUUID() }),
  });

export const cancelBets = (roundId: string) => api<{ cancelled: number; refunded: number }>(`/rounds/${roundId}/bets`, { method: "DELETE" });

export const myBets = (roundId: string) => api<MyBet[]>(`/rounds/${roundId}/bets/me`);

export const tableStateUrl = (tableId = TABLE_ID_BTC) => `${API_URL}/tables/${tableId}/state`;
