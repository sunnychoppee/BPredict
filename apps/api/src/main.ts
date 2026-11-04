import "reflect-metadata";
import { env } from "./config/env";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

// BigInt columns (balances, ledger amounts) serialise as numbers; values stay far below 2^53.
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  return Number(this);
};

async function bootstrap() {
  // rawBody: payment webhooks (Stripe / NOWPayments / Telegram) verify signatures over the exact bytes.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.use(cookieParser());
  app.enableCors({ origin: env.WEB_URL, credentials: true });
  app.enableShutdownHooks();
  await app.listen(env.API_PORT);
  Logger.log(`api listening on :${env.API_PORT} (${env.APP_ENV})`, "Bootstrap");
}

bootstrap();
