import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_ECONOMY, ROUND_SECONDS, TABLE_ID_BTC } from "@bpredict/shared";

config({ path: resolve(__dirname, "../../../.env") });

const prisma = new PrismaClient();

async function main() {
  await prisma.gameTable.upsert({
    where: { id: TABLE_ID_BTC },
    create: { id: TABLE_ID_BTC, symbol: "BTCUSDT", roundSeconds: ROUND_SECONDS, enabled: true },
    update: {},
  });
  console.log(`table ${TABLE_ID_BTC} ready`);

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
