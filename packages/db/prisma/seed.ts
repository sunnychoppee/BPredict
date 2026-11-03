import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_ECONOMY } from "@bpredict/shared";

config({ path: resolve(__dirname, "../../../.env") });

const prisma = new PrismaClient();

async function main() {
  for (const [key, value] of Object.entries(DEFAULT_ECONOMY)) {
    await prisma.economyParam.upsert({
      where: { key },
      create: { key, value: value as object },
      update: {},
    });
  }
  console.log(`seeded ${Object.keys(DEFAULT_ECONOMY).length} economy params (existing keys untouched)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
