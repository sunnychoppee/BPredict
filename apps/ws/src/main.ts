import { config } from "dotenv";
import { resolve } from "node:path";
import * as Sentry from "@sentry/node";
import { createServer, type IncomingMessage } from "node:http";
import { z } from "zod";
import Redis from "ioredis";
import jwt from "jsonwebtoken";
import { WebSocketServer, WebSocket } from "ws";
import { TABLE_ID_BTC, redisKeys, type ClientEvent, type PriceTick, type RoundResult, type ServerEvent } from "@bpredict/shared";

config({ path: resolve(process.cwd(), "../../.env") });
config();

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.APP_ENV ?? "local",
    release: process.env.RAILWAY_GIT_COMMIT_SHA ?? undefined,
    tracesSampleRate: 0,
  });
}

const env = z
  .object({
    APP_ENV: z.enum(["local", "uat", "production"]).default("local"),
    WS_PORT: z.coerce.number().default(3002),
    PORT: z.coerce.number().optional(), // Railway injects PORT
    REDIS_URL: z.string().default("redis://localhost:6379"),
    JWT_SECRET: z.string().min(16),
    WEB_URL: z.string().optional(),
    /** Per-IP connection cap. Raise temporarily for load tests that originate from one address. */
    WS_MAX_CONN_PER_IP: z.coerce.number().int().positive().default(20),
  })
  .parse(process.env);

const PORT = env.PORT ?? env.WS_PORT;
const HEARTBEAT_MS = 15_000;
const POOL_THROTTLE_MS = 250;
const MAX_CONN_PER_IP = env.WS_MAX_CONN_PER_IP;

interface Client {
  ws: WebSocket;
  userId: string | null;
  tableId: string;
  ip: string;
  alive: boolean;
}

const log = (s: string) => console.log(`${new Date().toISOString()} [ws] ${s}`);

const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
const sub = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
redis.on("error", (e) => log(`redis: ${e.message}`));
sub.on("error", (e) => log(`redis-sub: ${e.message}`));

const rooms = new Map<string, Set<Client>>();
const users = new Map<string, Set<Client>>();
const perIp = new Map<string, number>();

const send = (c: Client, ev: ServerEvent) => {
  if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(ev));
};
const broadcast = (tableId: string, ev: ServerEvent) => {
  const room = rooms.get(tableId);
  if (!room) return;
  const payload = JSON.stringify(ev);
  for (const c of room) if (c.ws.readyState === WebSocket.OPEN) c.ws.send(payload);
};
const toUser = (userId: string, ev: ServerEvent) => {
  const set = users.get(userId);
  if (!set) return;
  for (const c of set) send(c, ev);
};

// ---- pool.update coalescing (latest value per table, flushed every 250 ms) ----
const pendingPools = new Map<string, ServerEvent>();
setInterval(() => {
  for (const [tableId, ev] of pendingPools) broadcast(tableId, ev);
  pendingPools.clear();
}, POOL_THROTTLE_MS);

// ---- Redis fan-out ----
void sub.psubscribe("table:*", "user:*").then(() => log("subscribed table:* user:*"));
sub.on("pmessage", (_pattern, channel, message) => {
  let ev: ServerEvent;
  try {
    ev = JSON.parse(message) as ServerEvent;
  } catch {
    return;
  }
  const [kind, id, ...rest] = channel.split(":");
  if (kind === "table" && id) {
    const event = rest.join(":");
    if (event === "pool.update") pendingPools.set(id, ev);
    else broadcast(id, ev);
  } else if (kind === "user" && id) {
    toUser(id, ev);
  }
});

// ---- snapshot on connect ----
async function snapshot(tableId: string): Promise<ServerEvent> {
  const [stateRaw, priceH, ticksRaw, resultsRaw] = await Promise.all([
    redis.get(redisKeys.tableState(tableId)).catch(() => null),
    redis.hgetall(redisKeys.price("BTCUSDT")).catch(() => ({}) as Record<string, string>),
    redis.lrange(redisKeys.priceTicks("BTCUSDT"), 0, 599).catch(() => [] as string[]),
    redis.lrange(redisKeys.tableResults(tableId), 0, 99).catch(() => [] as string[]),
  ]);
  const state = stateRaw ? (JSON.parse(stateRaw) as Extract<ServerEvent, { t: "round.state" }>) : null;
  let betting = state?.betting ?? null;
  if (betting) {
    const pools = await redis.hgetall(redisKeys.roundPools(betting.id)).catch(() => ({}) as Record<string, string>);
    if (pools.BANKER !== undefined || pools.PLAYER !== undefined) {
      betting = { ...betting, poolBanker: Number(pools.BANKER ?? 0), poolPlayer: Number(pools.PLAYER ?? 0) };
    }
  }
  const price: PriceTick | null = priceH.price ? { price: Number(priceH.price), source: priceH.source ?? "?", ts: Number(priceH.ts) } : null;
  const results = resultsRaw.map((s) => JSON.parse(s) as RoundResult).reverse();
  const ticks = ticksRaw.map((s) => JSON.parse(s) as PriceTick).reverse();
  return { t: "snapshot", tableId, serverTime: Date.now(), betting, locked: state?.locked ?? null, price, ticks, results };
}

// ---- HTTP (health) + WS ----
const server = createServer((req, res) => {
  if (req.url?.startsWith("/health")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", clients: [...rooms.values()].reduce((n, s) => n + s.size, 0), env: env.APP_ENV }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });

function ipOf(req: IncomingMessage) {
  const xf = req.headers["x-forwarded-for"];
  const first = Array.isArray(xf) ? xf[0] : xf?.split(",")[0];
  return (first ?? req.socket.remoteAddress ?? "?").trim();
}

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/", "http://x");
  const ip = ipOf(req);
  const count = (perIp.get(ip) ?? 0) + 1;
  if (count > MAX_CONN_PER_IP) {
    ws.close(1008, "too many connections");
    return;
  }
  perIp.set(ip, count);

  let userId: string | null = null;
  const token = url.searchParams.get("token");
  if (token) {
    try {
      const p = jwt.verify(token, env.JWT_SECRET) as { sub?: string; typ?: string };
      if (p.typ === "access" && p.sub) userId = p.sub;
    } catch {
      /* anonymous spectator */
    }
  }

  const tableId = url.searchParams.get("table") ?? TABLE_ID_BTC;
  const client: Client = { ws, userId, tableId, ip, alive: true };
  if (!rooms.has(tableId)) rooms.set(tableId, new Set());
  rooms.get(tableId)!.add(client);
  if (userId) {
    if (!users.has(userId)) users.set(userId, new Set());
    users.get(userId)!.add(client);
  }

  send(client, { t: "hello", serverTime: Date.now() });
  void snapshot(tableId).then((s) => send(client, s));

  ws.on("pong", () => (client.alive = true));
  ws.on("message", (raw) => {
    let msg: ClientEvent;
    try {
      msg = JSON.parse(raw.toString()) as ClientEvent;
    } catch {
      return;
    }
    if (msg.t === "ping") send(client, { t: "pong", nonce: msg.nonce, serverTime: Date.now() });
    else if (msg.t === "subscribe" && msg.tableId && msg.tableId !== client.tableId) {
      rooms.get(client.tableId)?.delete(client);
      client.tableId = msg.tableId;
      if (!rooms.has(msg.tableId)) rooms.set(msg.tableId, new Set());
      rooms.get(msg.tableId)!.add(client);
      void snapshot(msg.tableId).then((s) => send(client, s));
    }
  });
  ws.on("close", () => {
    rooms.get(client.tableId)?.delete(client);
    if (userId) {
      const set = users.get(userId);
      set?.delete(client);
      if (set && set.size === 0) users.delete(userId);
    }
    const n = (perIp.get(ip) ?? 1) - 1;
    if (n <= 0) perIp.delete(ip);
    else perIp.set(ip, n);
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    for (const c of room) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      c.ws.ping();
    }
  }
}, HEARTBEAT_MS);

server.listen(PORT, () => log(`listening on :${PORT} (${env.APP_ENV})`));

const shutdown = () => {
  log("shutting down");
  wss.clients.forEach((c) => c.close(1001, "server restart"));
  server.close();
  void Promise.all([redis.quit(), sub.quit()]).finally(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
