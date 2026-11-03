import { defineRailway, github, group, postgres, preserve, project, redis, service } from "railway/iac";

/**
 * BPredict on Railway — one environment per `railway config apply`.
 *
 * Secrets (JWT_*, TELEGRAM_BOT_TOKEN, GOOGLE_*, RESEND_API_KEY) are set once with
 * `railway variable set <KEY> --stdin --service <svc>` and referenced here with preserve().
 * Public URLs are the Railway-generated domains; change them if you regenerate domains.
 */
const REGION = "sin"; // Southeast Asia (Singapore)

const URLS = {
  uat: {
    api: "https://api-uat-123a.up.railway.app",
    ws: "wss://ws-uat.up.railway.app",
    web: "https://web-uat-3b0f.up.railway.app",
  },
} as const;

export default defineRailway((ctx) => {
  const envName = (ctx.environment in URLS ? ctx.environment : "uat") as keyof typeof URLS;
  const urls = URLS[envName];
  const appEnv = envName === "production" ? "production" : "uat";

  const repo = github("sunnychoppee/BPredict", { branch: "main" });

  const db = postgres("Postgres", { region: REGION });
  const cache = redis("Redis", { region: REGION });

  const common = {
    NODE_ENV: "production",
    APP_ENV: appEnv,
  };

  const api = service("api", {
    source: repo,
    build: "pnpm turbo run build --filter=@bpredict/api...",
    preDeploy: "pnpm db:deploy && pnpm db:seed",
    start: "pnpm --filter @bpredict/api start",
    healthcheck: "/health",
    healthcheckTimeout: 120,
    replicas: { [REGION]: 1 },
    env: {
      ...common,
      DATABASE_URL: db.env.DATABASE_URL,
      REDIS_URL: cache.env.REDIS_URL,
      WEB_URL: urls.web,
      GOOGLE_CALLBACK_URL: `${urls.api}/auth/google/callback`,
      RESEND_FROM: "BPredict <onboarding@resend.dev>",
      JWT_SECRET: preserve(),
      JWT_REFRESH_SECRET: preserve(),
      TELEGRAM_BOT_TOKEN: preserve(),
      GOOGLE_CLIENT_ID: preserve(),
      GOOGLE_CLIENT_SECRET: preserve(),
      RESEND_API_KEY: preserve(),
    },
  });

  const ws = service("ws", {
    source: repo,
    build: "pnpm turbo run build --filter=@bpredict/ws...",
    start: "pnpm --filter @bpredict/ws start",
    healthcheck: "/health",
    healthcheckTimeout: 120,
    replicas: { [REGION]: 1 },
    env: {
      ...common,
      REDIS_URL: cache.env.REDIS_URL,
      WEB_URL: urls.web,
      JWT_SECRET: preserve(),
    },
  });

  const worker = service("worker", {
    source: repo,
    build: "pnpm turbo run build --filter=@bpredict/worker...",
    start: "pnpm --filter @bpredict/worker start",
    replicas: { [REGION]: 1 }, // exactly one: it is the round scheduler (leader lock is a safety net, not a scaling model)
    env: {
      ...common,
      DATABASE_URL: db.env.DATABASE_URL,
      REDIS_URL: cache.env.REDIS_URL,
      WORKER_SCHEDULER: "1",
    },
  });

  const web = service("web", {
    source: repo,
    build: "pnpm turbo run build --filter=@bpredict/web...",
    start: "pnpm --filter @bpredict/web start",
    healthcheck: "/",
    healthcheckTimeout: 120,
    replicas: { [REGION]: 1 },
    env: {
      ...common,
      NEXT_PUBLIC_APP_ENV: appEnv,
      NEXT_PUBLIC_API_URL: urls.api,
      NEXT_PUBLIC_WS_URL: urls.ws,
      NEXT_PUBLIC_DEFAULT_LOCALE: "zh-Hant",
      NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: "BacPredict_bot",
    },
  });

  return project("bpredict", {
    resources: [group("Data", [db, cache]), group("Backend", [api, ws, worker]), web],
  });
});
