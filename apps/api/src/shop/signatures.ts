import { createHmac, timingSafeEqual } from "node:crypto";

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length > 0 && ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Recursively sort object keys — NOWPayments signs `JSON.stringify(sorted(body))`. */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) out[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
    return out;
  }
  return value;
}

/** NOWPayments IPN: `x-nowpayments-sig` = HMAC-SHA512(ipnSecret, JSON.stringify(sortedBody)). */
export function nowpaymentsSign(body: unknown, ipnSecret: string): string {
  return createHmac("sha512", ipnSecret).update(JSON.stringify(sortKeysDeep(body))).digest("hex");
}

export function verifyNowpaymentsSig(body: unknown, sig: string | undefined, ipnSecret: string): boolean {
  if (!sig) return false;
  return safeEqualHex(nowpaymentsSign(body, ipnSecret), sig);
}

/** Stripe: `Stripe-Signature: t=<ts>,v1=<hex>`; signed payload is `${t}.${rawBody}` with HMAC-SHA256. */
export function stripeSign(rawBody: string | Buffer, secret: string, timestampSec: number): string {
  const payload = Buffer.concat([Buffer.from(`${timestampSec}.`), Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody)]);
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyStripeSig(
  rawBody: string | Buffer,
  header: string | undefined,
  secret: string,
  opts: { toleranceSec?: number; now?: () => number } = {},
): boolean {
  if (!header) return false;
  const parts = new Map<string, string[]>();
  for (const kv of header.split(",")) {
    const [k, v] = kv.trim().split("=", 2);
    if (!k || !v) continue;
    parts.set(k, [...(parts.get(k) ?? []), v]);
  }
  const t = Number(parts.get("t")?.[0]);
  const sigs = parts.get("v1") ?? [];
  if (!Number.isFinite(t) || sigs.length === 0) return false;
  const nowSec = Math.floor((opts.now ?? Date.now)() / 1000);
  if (Math.abs(nowSec - t) > (opts.toleranceSec ?? 300)) return false;
  const expected = stripeSign(rawBody, secret, t);
  return sigs.some((s) => safeEqualHex(expected, s));
}

/** Telegram webhook: compare `X-Telegram-Bot-Api-Secret-Token` with the configured secret. */
export function verifyTelegramWebhookSecret(header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
