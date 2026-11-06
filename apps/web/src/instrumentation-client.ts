// Next 15.3+ runs this once in the browser before hydration. No-op without a DSN.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? "local",
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Telegram WebView and extension noise we cannot act on.
    ignoreErrors: ["ResizeObserver loop", "Load failed", "NetworkError when attempting to fetch resource", "WebSocket is closed before the connection is established"],
    beforeSend(event) {
      // initData / tokens may appear in URLs on the auth pages; strip query strings.
      if (event.request?.url) event.request.url = event.request.url.split("?")[0];
      return event;
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
