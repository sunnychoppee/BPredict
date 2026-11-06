import "./instrument";
import { env } from "./env";
import { createPrismaClient } from "@bpredict/db";
import { TABLE_ID_BTC } from "@bpredict/shared";
import { log } from "./log";
import { createRedis } from "./redis";
import { PriceFeed } from "./price-feed";
import { RoundEngine } from "./engine";

async function main() {
  const prisma = createPrismaClient();
  await prisma.$connect();
  const redis = createRedis("main");

  const table = await prisma.gameTable.findUnique({ where: { id: TABLE_ID_BTC } });
  if (!table) {
    log.error("worker", `table ${TABLE_ID_BTC} missing — run \`pnpm db:seed\``);
    process.exit(1);
  }
  if (!table.enabled) log.warn("worker", `table ${table.id} is disabled; feed runs, engine idle`);

  const feed = new PriceFeed(redis, table.symbol, table.id);
  feed.start();

  let engine: RoundEngine | null = null;
  if (env.WORKER_SCHEDULER === "1" && table.enabled) {
    engine = new RoundEngine(prisma, redis, feed, table.id, table.roundSeconds);
    engine.start();
  }

  const shutdown = async (sig: string) => {
    log.info("worker", `${sig} received, shutting down`);
    feed.stop();
    await engine?.stop();
    await redis.quit().catch(() => undefined);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  log.info("worker", `up (${env.APP_ENV}) table=${table.id} symbol=${table.symbol} round=${table.roundSeconds}s`);
}

main().catch((e) => {
  log.error("worker", "fatal", e);
  process.exit(1);
});
