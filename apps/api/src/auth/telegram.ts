import { createHmac, timingSafeEqual } from "node:crypto";
import { TELEGRAM_INITDATA_MAX_AGE_SEC } from "@bpredict/shared";

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: boolean;
}

export class TelegramInitDataError extends Error {}

/**
 * Validates Telegram Mini App `initData` per
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  opts: { maxAgeSec?: number; now?: () => number } = {},
): { user: TelegramUser; authDate: number } {
  const maxAge = opts.maxAgeSec ?? TELEGRAM_INITDATA_MAX_AGE_SEC;
  const nowSec = Math.floor((opts.now ?? Date.now)() / 1000);

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new TelegramInitDataError("missing hash");
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new TelegramInitDataError("bad signature");

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate)) throw new TelegramInitDataError("missing auth_date");
  if (nowSec - authDate > maxAge) throw new TelegramInitDataError("expired");

  const rawUser = params.get("user");
  if (!rawUser) throw new TelegramInitDataError("missing user");
  let user: TelegramUser;
  try {
    user = JSON.parse(rawUser) as TelegramUser;
  } catch {
    throw new TelegramInitDataError("bad user json");
  }
  if (typeof user.id !== "number") throw new TelegramInitDataError("bad user id");

  return { user, authDate };
}

/** Test / tooling helper: produce a signed initData string the way Telegram would. */
export function signTelegramInitData(fields: Record<string, string>, botToken: string): string {
  const params = new URLSearchParams(fields);
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}
