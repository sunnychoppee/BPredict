// Server / edge runtime init (Next.js instrumentation hook). No-op without a DSN.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? "local",
    release: process.env.RAILWAY_GIT_COMMIT_SHA ?? undefined,
    tracesSampleRate: 0,
  });
}

export const onRequestError = Sentry.captureRequestError;
