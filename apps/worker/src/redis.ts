import Redis from "ioredis";
import { env } from "./env";
import { log } from "./log";

export function createRedis(name: string): Redis {
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });
  client.on("error", (e) => log.warn(`redis:${name}`, e.message));
  client.on("ready", () => log.info(`redis:${name}`, "connected"));
  return client;
}

export async function publish(redis: Redis, channel: string, payload: unknown) {
  try {
    await redis.publish(channel, JSON.stringify(payload));
  } catch (e) {
    log.warn("publish", `${channel}: ${(e as Error).message}`);
  }
}
