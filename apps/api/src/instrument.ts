// Must be imported before anything else (see main.ts) so Sentry can patch http/pg/redis.
import { config } from "dotenv";
import { resolve } from "node:path";
import * as Sentry from "@sentry/nestjs";

config({ path: resolve(process.cwd(), "../../.env") });
config();

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.APP_ENV ?? "local",
    release: process.env.RAILWAY_GIT_COMMIT_SHA ?? undefined,
    // Errors always; a light trace sample so slow endpoints show up without eating quota.
    tracesSampleRate: process.env.APP_ENV === "production" ? 0.05 : 0.2,
    beforeSend(event) {
      // Never ship secrets that may sit in request headers.
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
        delete event.request.headers["x-nowpayments-sig"];
        delete event.request.headers["stripe-signature"];
        delete event.request.headers["x-telegram-bot-api-secret-token"];
      }
      return event;
    },
  });
}

export const sentryEnabled = Boolean(dsn);
