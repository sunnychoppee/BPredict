import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
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

  // Shop catalogue (W4). Stars ≈ 1 USDT : 50 Stars. Prices are editable from the admin later; seed leaves existing rows untouched.
  const stars = (usdt: number) => Math.ceil(usdt * 50);
  const products: Prisma.ProductCreateInput[] = [
    ...DEFAULT_ECONOMY.coin_packs.map((p, i) => ({
      id: `coins_${p.usdt}`,
      type: "COINS" as const,
      name: `${p.coins.toLocaleString("en-US")} 金幣`,
      priceUsdt: p.usdt,
      priceStars: stars(p.usdt),
      coins: BigInt(p.coins),
      bonusPct: Math.round((p.coins / (p.usdt * DEFAULT_ECONOMY.exchange_rate_coins_per_usdt) - 1) * 100),
      sortOrder: 10 + i,
    })),
    ...[5, 10, 30, 100].map((usdt, i) => ({
      id: `gems_${usdt}`,
      type: "GEMS" as const,
      name: `${usdt * DEFAULT_ECONOMY.exchange_rate_gems_per_usdt} 寶石`,
      priceUsdt: usdt,
      priceStars: stars(usdt),
      gems: usdt * DEFAULT_ECONOMY.exchange_rate_gems_per_usdt,
      sortOrder: 50 + i,
    })),
    {
      id: "vip_month",
      type: "VIP" as const,
      name: "VIP 月卡",
      priceUsdt: DEFAULT_ECONOMY.vip_monthly_price_usdt,
      priceStars: stars(DEFAULT_ECONOMY.vip_monthly_price_usdt),
      vipDays: 30,
      sortOrder: 90,
    },
  ];
  for (const p of products) await prisma.product.upsert({ where: { id: p.id }, create: p, update: {} });
  console.log(`seeded ${products.length} products (existing rows untouched)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
