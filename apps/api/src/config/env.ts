import { config } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

// Local dev: shared .env at repo root. Railway: variables injected, file absent.
config({ path: resolve(process.cwd(), "../../.env") });
config();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["local", "uat", "production"]).default("local"),
  // Railway injects PORT; locally we use API_PORT.
  PORT: z.coerce.number().int().positive().optional(),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_URL: z.string().url().default("http://localhost:3000"),

  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  /** Secret token the Bot API echoes in `X-Telegram-Bot-Api-Secret-Token` on webhook calls (Stars payments). */
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  /** Public base URL of this api (used to register the Telegram webhook). */
  API_PUBLIC_URL: z.string().url().optional(),

  // Payments — all optional; a channel is offered in the shop only when its keys are present.
  NOWPAYMENTS_API_KEY: z.string().optional(),
  NOWPAYMENTS_IPN_SECRET: z.string().optional(),
  NOWPAYMENTS_SANDBOX: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  /**
   * Escape hatch: NOWPayments discontinued its sandbox, so an end-to-end USDT test has to use
   * live keys. Setting this to "true" lets a non-production api start with NOWPAYMENTS_SANDBOX=false.
   * Remove it (and the live keys) from UAT once the test is done.
   */
  NOWPAYMENTS_ALLOW_LIVE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().default("http://localhost:3001/auth/google/callback"),

  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().default("BPredict <onboarding@resend.dev>"),

  SENTRY_DSN: z.string().optional(),

  /** Comma-separated identity emails that may use the /admin console (W5). Empty = nobody. */
  ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean),
    ),
});

export type Env = z.infer<typeof schema>;

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:\n" + parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n"));
  process.exit(1);
}

export const env: Env = { ...parsed.data, API_PORT: parsed.data.PORT ?? parsed.data.API_PORT };
export const isLocal = env.APP_ENV === "local";
export const isProduction = env.APP_ENV === "production";

// Guard rail: UAT / local must never carry live payment keys (TECH_DESIGN §11).
if (!isProduction) {
  if (env.STRIPE_SECRET_KEY?.startsWith("sk_live_")) {
    console.error("Refusing to start: live Stripe key in a non-production environment");
    process.exit(1);
  }
  if (env.NOWPAYMENTS_API_KEY && !env.NOWPAYMENTS_SANDBOX) {
    if (!env.NOWPAYMENTS_ALLOW_LIVE) {
      console.error("Refusing to start: NOWPAYMENTS_SANDBOX must be true outside production (set NOWPAYMENTS_ALLOW_LIVE=true to override for a one-off live test)");
      process.exit(1);
    }
    console.warn("WARNING: live NOWPayments keys enabled in a non-production environment (NOWPAYMENTS_ALLOW_LIVE=true) — real USDT will move");
  }
}
