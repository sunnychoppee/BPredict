import { ROUND_SECONDS, TABLE_ID_BTC } from "@bpredict/shared";

// W2: round scheduler (leader lock), price feed (Binance → OKX → Bybit), settlement.
console.log(`[worker] scaffold — table=${TABLE_ID_BTC} round=${ROUND_SECONDS}s. Round engine lands in W2.`);
