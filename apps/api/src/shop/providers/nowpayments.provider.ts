import { BadRequestException, Injectable } from "@nestjs/common";
import type { UsdtChain } from "@bpredict/shared";
import { env } from "../../config/env";
import { httpJson, type CheckoutContext, type CheckoutResult, type PaymentProviderAdapter } from "./provider";

/** NOWPayments pay-currency codes for the USDT networks we accept (TECH_DESIGN §7.2). */
export const NOWPAYMENTS_CHAIN_CURRENCY: Record<UsdtChain, string> = {
  TRC20: "usdttrc20",
  BEP20: "usdtbsc",
  TON: "usdtton",
};

interface InvoiceResponse {
  id: string | number;
  invoice_url: string;
  price_amount?: string | number;
  created_at?: string;
}

/**
 * USDT via NOWPayments hosted invoice. Sandbox and production share the API shape;
 * only the base URL differs. The IPN callback is verified in `WebhooksController`.
 */
@Injectable()
export class NowPaymentsProvider implements PaymentProviderAdapter {
  readonly id = "NOWPAYMENTS" as const;
  readonly label = "USDT 加密貨幣";
  get note() {
    return env.NOWPAYMENTS_SANDBOX ? "Sandbox（測試網）" : undefined;
  }

  private get baseUrl() {
    return env.NOWPAYMENTS_SANDBOX ? "https://api-sandbox.nowpayments.io/v1" : "https://api.nowpayments.io/v1";
  }

  enabled(): boolean {
    return Boolean(env.NOWPAYMENTS_API_KEY && env.NOWPAYMENTS_IPN_SECRET && env.API_PUBLIC_URL);
  }

  async createCheckout(ctx: CheckoutContext): Promise<CheckoutResult> {
    if (!ctx.chain) throw new BadRequestException("請選擇 USDT 網路");
    const payCurrency = NOWPAYMENTS_CHAIN_CURRENCY[ctx.chain];
    await this.assertAboveMinimum(payCurrency, Number(ctx.product.priceUsdt), ctx.chain);
    const body = {
      price_amount: Number(ctx.product.priceUsdt),
      price_currency: "usd",
      pay_currency: payCurrency,
      order_id: ctx.payment.id,
      order_description: ctx.product.name,
      ipn_callback_url: `${env.API_PUBLIC_URL}/webhooks/nowpayments`,
      success_url: `${env.WEB_URL}/shop?order=${ctx.payment.id}&result=success`,
      cancel_url: `${env.WEB_URL}/shop?order=${ctx.payment.id}&result=cancel`,
      is_fixed_rate: true,
      is_fee_paid_by_user: false,
    };
    const res = await httpJson<InvoiceResponse>(`${this.baseUrl}/invoice`, {
      method: "POST",
      headers: { "x-api-key": env.NOWPAYMENTS_API_KEY!, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return {
      providerOrderId: String(res.id),
      payUrl: res.invoice_url,
      // Invoices stay payable for a while on the provider side; we show 24 h locally.
      expiresAt: new Date(Date.now() + 24 * 3600_000),
      meta: { payCurrency, sandbox: env.NOWPAYMENTS_SANDBOX },
      next: { kind: "redirect", url: res.invoice_url },
    };
  }

  /**
   * NOWPayments enforces a per-currency minimum that depends on the merchant's payout wallet
   * (e.g. ~11 USDT when everything settles to USDT-TRC20). The hosted invoice page renders blank
   * when the amount is below it, so check first and fail with a readable message. Fails open on
   * network errors — the invoice call will surface a hard error anyway.
   */
  private async assertAboveMinimum(payCurrency: string, priceUsd: number, chain: UsdtChain) {
    let min: { min_amount?: number; fiat_equivalent?: number };
    try {
      min = await httpJson(`${this.baseUrl}/min-amount?currency_from=${payCurrency}&fiat_equivalent=usd`, {
        headers: { "x-api-key": env.NOWPAYMENTS_API_KEY! },
        timeoutMs: 8_000,
      });
    } catch {
      return;
    }
    const minUsd = Number(min.fiat_equivalent ?? 0);
    if (minUsd > 0 && priceUsd < minUsd) {
      const minUsdt = Number(min.min_amount ?? minUsd).toFixed(2);
      throw new BadRequestException(`USDT（${chain}）單筆最低 ${minUsdt} USDT，請選擇更高的方案或其他網路`);
    }
  }
}
