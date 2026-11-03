import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@bpredict/db";
import { isLocal } from "../config/env";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PrismaService.name);

  constructor() {
    super({ log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"] });
  }

  async onModuleInit() {
    try {
      await this.$connect();
    } catch (e) {
      // Locally we tolerate a missing database so the API can still boot (health reports "degraded").
      // In UAT / production a missing database is fatal.
      if (!isLocal) throw e;
      this.log.warn(`database unreachable at startup: ${(e as Error).message.split("\n")[0]}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
