import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";
export * from "./ledger";
export * from "./views";

declare global {
  // eslint-disable-next-line no-var
  var __bpredictPrisma: PrismaClient | undefined;
}

export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
  });
}

/** Process-wide singleton (survives hot reload in dev). */
export const prisma: PrismaClient = globalThis.__bpredictPrisma ?? createPrismaClient();
if (process.env.NODE_ENV !== "production") globalThis.__bpredictPrisma = prisma;
