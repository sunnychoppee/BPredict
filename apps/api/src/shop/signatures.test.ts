import { describe, expect, it } from "vitest";
import { nowpaymentsSign, stripeSign, verifyNowpaymentsSig, verifyStripeSig, verifyTelegramWebhookSecret } from "./signatures";

describe("NOWPayments IPN signature", () => {
  const secret = "ipn-secret";
  const body = { payment_status: "finished", order_id: "abc", nested: { b: 1, a: 2 }, actually_paid: 4.99 };

  it("accepts a signature computed over sorted keys", () => {
    expect(verifyNowpaymentsSig(body, nowpaymentsSign(body, secret), secret)).toBe(true);
  });
  it("is independent of key order", () => {
    const reordered = { actually_paid: 4.99, nested: { a: 2, b: 1 }, order_id: "abc", payment_status: "finished" };
    expect(nowpaymentsSign(reordered, secret)).toBe(nowpaymentsSign(body, secret));
  });
  it("rejects tampered body / missing header", () => {
    const sig = nowpaymentsSign(body, secret);
    expect(verifyNowpaymentsSig({ ...body, actually_paid: 0.01 }, sig, secret)).toBe(false);
    expect(verifyNowpaymentsSig(body, undefined, secret)).toBe(false);
    expect(verifyNowpaymentsSig(body, "zz", secret)).toBe(false);
  });
});

describe("Stripe webhook signature", () => {
  const secret = "whsec_test";
  const raw = Buffer.from('{"id":"evt_1","type":"checkout.session.completed"}');
  const now = 1_800_000_000_000;
  const t = Math.floor(now / 1000) - 5;

  it("accepts a fresh v1 signature", () => {
    const header = `t=${t},v1=${stripeSign(raw, secret, t)}`;
    expect(verifyStripeSig(raw, header, secret, { now: () => now })).toBe(true);
  });
  it("accepts when one of several v1 entries matches", () => {
    const header = `t=${t},v1=deadbeef,v1=${stripeSign(raw, secret, t)}`;
    expect(verifyStripeSig(raw, header, secret, { now: () => now })).toBe(true);
  });
  it("rejects stale timestamps, wrong secret and tampered bodies", () => {
    const old = t - 1000;
    expect(verifyStripeSig(raw, `t=${old},v1=${stripeSign(raw, secret, old)}`, secret, { now: () => now })).toBe(false);
    expect(verifyStripeSig(raw, `t=${t},v1=${stripeSign(raw, "other", t)}`, secret, { now: () => now })).toBe(false);
    expect(verifyStripeSig(Buffer.from("{}"), `t=${t},v1=${stripeSign(raw, secret, t)}`, secret, { now: () => now })).toBe(false);
    expect(verifyStripeSig(raw, undefined, secret)).toBe(false);
  });
});

describe("Telegram webhook secret", () => {
  it("compares in constant time and rejects mismatches", () => {
    expect(verifyTelegramWebhookSecret("s3cret", "s3cret")).toBe(true);
    expect(verifyTelegramWebhookSecret("s3cre", "s3cret")).toBe(false);
    expect(verifyTelegramWebhookSecret(undefined, "s3cret")).toBe(false);
  });
});
