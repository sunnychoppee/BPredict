import WebSocket from "ws";
import type Redis from "ioredis";
import { PRICE_FAILBACK_MS, PRICE_STALE_MS, redisKeys, tableChannel, type ServerEvent } from "@bpredict/shared";
import { log } from "./log";
import { publish } from "./redis";

const TICK_HISTORY = 600;

interface SourceDef {
  name: string;
  url: string;
  subscribe?: unknown;
  pingEveryMs?: number;
  pingPayload?: unknown;
  /** Return the latest trade price + exchange timestamp from a raw message, or null. */
  parse(msg: unknown): { price: number; ts: number } | null;
}

const SOURCES: SourceDef[] = [
  {
    name: "binance",
    url: "wss://stream.binance.com:9443/ws/btcusdt@trade",
    parse: (m) => {
      const o = m as { e?: string; p?: string; T?: number };
      return o.e === "trade" && o.p ? { price: Number(o.p), ts: Number(o.T) } : null;
    },
  },
  {
    name: "okx",
    url: "wss://ws.okx.com:8443/ws/v5/public",
    subscribe: { op: "subscribe", args: [{ channel: "trades", instId: "BTC-USDT" }] },
    pingEveryMs: 25_000,
    pingPayload: "ping",
    parse: (m) => {
      const o = m as { arg?: { channel?: string }; data?: { px: string; ts: string }[] };
      const d = o.arg?.channel === "trades" ? o.data?.[o.data.length - 1] : undefined;
      return d ? { price: Number(d.px), ts: Number(d.ts) } : null;
    },
  },
  {
    name: "bybit",
    url: "wss://stream.bybit.com/v5/public/spot",
    subscribe: { op: "subscribe", args: ["publicTrade.BTCUSDT"] },
    pingEveryMs: 20_000,
    pingPayload: { op: "ping" },
    parse: (m) => {
      const o = m as { topic?: string; data?: { p: string; T: number }[] };
      const d = o.topic?.startsWith("publicTrade") ? o.data?.[o.data.length - 1] : undefined;
      return d ? { price: Number(d.p), ts: Number(d.T) } : null;
    },
  },
];

interface SourceState {
  def: SourceDef;
  price: number | null;
  exchangeTs: number;
  /** Local receive time of the last trade. Health is judged on this, not on exchange clocks. */
  seenAt: number;
  /** Local time since which this source has been continuously healthy. */
  healthySince: number;
  ws: WebSocket | null;
  backoff: number;
  pingTimer: NodeJS.Timeout | null;
}

export interface LatestPrice {
  price: number;
  source: string;
  ts: number;
}

export class PriceFeed {
  private readonly states: SourceState[];
  private active: SourceState | null = null;
  private stopped = false;
  private tickTimer: NodeJS.Timeout | null = null;
  private lastWrite = 0;

  constructor(
    private readonly redis: Redis,
    private readonly symbol: string,
    private readonly tableId: string,
  ) {
    this.states = SOURCES.map((def) => ({ def, price: null, exchangeTs: 0, seenAt: 0, healthySince: 0, ws: null, backoff: 1000, pingTimer: null }));
  }

  start() {
    for (const s of this.states) this.connect(s);
    this.tickTimer = setInterval(() => void this.tick(), 1000);
    log.info("feed", `started for ${this.symbol} (${SOURCES.map((s) => s.name).join(" → ")})`);
  }

  stop() {
    this.stopped = true;
    if (this.tickTimer) clearInterval(this.tickTimer);
    for (const s of this.states) {
      if (s.pingTimer) clearInterval(s.pingTimer);
      s.ws?.terminate();
    }
  }

  /** Latest price from the active source, or null if nothing fresh. */
  latest(): LatestPrice | null {
    const a = this.active;
    if (!a || a.price == null || Date.now() - a.seenAt > PRICE_STALE_MS) return null;
    return { price: a.price, source: a.def.name, ts: a.exchangeTs };
  }

  // ---- internals ----

  private connect(s: SourceState) {
    if (this.stopped) return;
    const ws = new WebSocket(s.def.url, { handshakeTimeout: 10_000 });
    s.ws = ws;

    ws.on("open", () => {
      s.backoff = 1000;
      if (s.def.subscribe) ws.send(JSON.stringify(s.def.subscribe));
      if (s.def.pingEveryMs) {
        s.pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            const p = s.def.pingPayload;
            ws.send(typeof p === "string" ? p : JSON.stringify(p));
          }
        }, s.def.pingEveryMs);
      }
      log.info(`feed:${s.def.name}`, "connected");
    });

    ws.on("message", (data) => {
      const text = data.toString();
      if (text === "pong") return;
      let msg: unknown;
      try {
        msg = JSON.parse(text);
      } catch {
        return;
      }
      const t = s.def.parse(msg);
      if (!t || !Number.isFinite(t.price) || t.price <= 0) return;
      const now = Date.now();
      if (s.price == null || now - s.seenAt > PRICE_STALE_MS) s.healthySince = now;
      s.price = t.price;
      s.exchangeTs = t.ts || now;
      s.seenAt = now;
      if (s === this.active) void this.writeLatest(now);
    });

    const onDown = (why: string) => {
      if (s.pingTimer) {
        clearInterval(s.pingTimer);
        s.pingTimer = null;
      }
      if (s.ws === ws) s.ws = null;
      if (this.stopped) return;
      log.warn(`feed:${s.def.name}`, `${why}; reconnecting in ${s.backoff}ms`);
      setTimeout(() => this.connect(s), s.backoff);
      s.backoff = Math.min(s.backoff * 2, 30_000);
    };
    ws.on("close", (code) => onDown(`closed ${code}`));
    ws.on("error", (e) => {
      log.warn(`feed:${s.def.name}`, e.message);
      ws.terminate();
    });
  }

  private isHealthy(s: SourceState, now: number) {
    return s.price != null && now - s.seenAt <= PRICE_STALE_MS;
  }

  /** Once a second: pick the active source, persist, publish. */
  private async tick() {
    const now = Date.now();
    const primary = this.states[0]!;
    const healthy = this.states.filter((s) => this.isHealthy(s, now));

    let next: SourceState | null = this.active && this.isHealthy(this.active, now) ? this.active : null;
    if (!next) next = healthy[0] ?? null;
    // Fail back to primary only after it has been stable for a while (avoids flapping).
    if (next && next !== primary && this.isHealthy(primary, now) && now - primary.healthySince >= PRICE_FAILBACK_MS) next = primary;

    if (next !== this.active) {
      log.info("feed", `active source: ${this.active?.def.name ?? "none"} → ${next?.def.name ?? "none"}`);
      this.active = next;
    }

    if (this.active) {
      await this.writeLatest(now, true);
      const ev: ServerEvent = { t: "price.tick", tableId: this.tableId, price: this.active.price!, source: this.active.def.name, ts: this.active.exchangeTs };
      await publish(this.redis, tableChannel(this.tableId, "price.tick"), ev);
      // 1 s history for the chart (≈ 10 min)
      try {
        const k = redisKeys.priceTicks(this.symbol);
        await this.redis.lpush(k, JSON.stringify({ price: ev.price, source: ev.source, ts: ev.ts }));
        await this.redis.ltrim(k, 0, TICK_HISTORY - 1);
        await this.redis.expire(k, 3600);
      } catch {
        /* non-critical */
      }
    }
  }

  private async writeLatest(now: number, force = false) {
    const a = this.active;
    if (!a || a.price == null) return;
    if (!force && now - this.lastWrite < 200) return;
    this.lastWrite = now;
    try {
      await this.redis.hset(redisKeys.price(this.symbol), { price: a.price.toFixed(2), source: a.def.name, ts: String(a.exchangeTs), seenAt: String(a.seenAt) });
    } catch (e) {
      log.warn("feed", `redis write failed: ${(e as Error).message}`);
    }
  }
}
