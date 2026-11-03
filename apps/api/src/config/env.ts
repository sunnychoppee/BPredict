import { config } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

// Local dev: shared .env at repo root. Railway: variables injected, file absent.
config({ path: resolve(process.cwd(), "../../.env") });
config();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["local", "uat", "production"]).default("local"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_URL: z.string().url().default("http://localhost:3000"),

  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional(),

  TELEGRAM_BOT_TOKEN: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().default("http://localhost:3001/auth/google/callback"),

  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().default("BPredict <onboarding@resend.dev>"),

  SENTRY_DSN: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:\n" + parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n"));
  process.exit(1);
}

export const env: Env = parsed.data;
export const isLocal = env.APP_ENV === "local";
