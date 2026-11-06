// Must be imported before anything else (see main.ts).
import { config } from "dotenv";
import { resolve } from "node:path";
import * as Sentry from "@sentry/node";

config({ path: resolve(process.cwd(), "../../.env") });
config();

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.APP_ENV ?? "local",
    release: process.env.RAILWAY_GIT_COMMIT_SHA ?? undefined,
    tracesSampleRate: 0,
  });
}

export const sentryEnabled = Boolean(dsn);
export const captureException = (err: unknown, context?: Record<string, unknown>) => {
  if (!dsn) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
};
