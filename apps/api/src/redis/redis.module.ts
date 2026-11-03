import { Global, Logger, Module } from "@nestjs/common";
import Redis from "ioredis";
import { env } from "../config/env";

export const REDIS = Symbol("REDIS");

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: () => {
        const log = new Logger("Redis");
        const client = new Redis(env.REDIS_URL, {
          lazyConnect: false,
          maxRetriesPerRequest: 2,
          enableOfflineQueue: true,
          retryStrategy: (times) => Math.min(times * 200, 5000),
        });
        process.once("SIGTERM", () => void client.quit());
        client.on("error", (e) => log.warn(e.message));
        client.on("ready", () => log.log("connected"));
        return client;
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
