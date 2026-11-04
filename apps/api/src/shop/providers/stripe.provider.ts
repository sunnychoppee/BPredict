import { Injectable } from "@nestjs/common";
import { env } from "../../config/env";
import { httpJson, type CheckoutContext, type CheckoutResult, type PaymentProviderAdapter } from "./provider";

interface CheckoutSession {
  id: string;
  url: string | null;
  expires_at?: number;
}

/**
 * Stripe Checkout (hosted page) via the REST API — no SDK needed for one endpoint.
 * Webhook `checkout.session.completed` settles the order (see `WebhooksController`).
 */
@Injectable()
export class StripeProvider implements PaymentProviderAdapter {
  readonly id = "STRIPE" as const;
  readonly label = "信用卡 / Apple Pay / Google Pay";
  get note() {
    return env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ? "測試模式" : undefined;
  }

  enabled(): boolean {
    return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
  }

  async createCheckout(ctx: CheckoutContext): Promise<CheckoutResult> {
    const cents = Math.round(Number(ctx.product.priceUsdt) * 100);
    // Stripe requires expires_at ≥ 30 min from now.
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
    const form = new URLSearchParams({
      mode: "payment",
      client_reference_id: ctx.payment.id,
      success_url: `${env.WEB_URL}/shop?order=${ctx.payment.id}&result=success`,
      cancel_url: `${env.WEB_URL}/shop?order=${ctx.payment.id}&result=cancel`,
      expires_at: String(expiresAt),
      "metadata[payment_id]": ctx.payment.id,
      "metadata[user_id]": ctx.userId,
      "metadata[product_id]": ctx.product.id,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(cents),
      "line_items[0][price_data][product_data][name]": `BPredict ${ctx.product.name}`,
    });
    const res = await httpJson<CheckoutSession>("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${env.STRIPE_SECRET_KEY}:`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
        "idempotency-key": `checkout:${ctx.payment.id}`,
      },
      body: form.toString(),
    });
    if (!res.url) throw new Error("stripe session has no url");
    return {
      providerOrderId: res.id,
      payUrl: res.url,
      expiresAt: new Date((res.expires_at ?? expiresAt) * 1000),
      meta: { test: env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ?? false },
      next: { kind: "redirect", url: res.url },
    };
  }
}
