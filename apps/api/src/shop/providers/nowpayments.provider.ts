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
      // Floating rate: USDT→USDT carries no rate risk, and fixed rate roughly doubles NOWPayments'
      // minimum (e.g. usdtbsc 0.09 → 8.5 USD, usdttrc20 10.8 → 19.3 USD) and raises the fee 1% → 1.5%.
      is_fixed_rate: false,
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
   * NOWPayments enforces a per-currency minimum that depends on the merchant's custody primary
   * balance (e.g. ~11 USDT for everything when it is USDT-TRC20; usdttrc20 itself is ~10.8 USDT).
   * The hosted invoice page renders blank below it, so check first and fail with a readable message.
   * Fails open when the minimum is unknown — the invoice call surfaces a hard error anyway.
   */
  private async assertAboveMinimum(payCurrency: string, priceUsd: number, chain: UsdtChain) {
    const min = await this.chainMinimum(payCurrency);
    if (min && priceUsd < min.usd) {
      throw new BadRequestException(`USDT（${chain}）單筆最低 ${min.usdt.toFixed(2)} USDT，請選擇更高的方案或其他網路`);
    }
  }

  private readonly minCache = new Map<string, { usd: number; usdt: number; at: number }>();
  private static readonly MIN_TTL_MS = 10 * 60_000;

  /** Minimum for one pay currency (USD + crypto), cached 10 min. Null when unknown. */
  private async chainMinimum(payCurrency: string): Promise<{ usd: number; usdt: number } | null> {
    const hit = this.minCache.get(payCurrency);
    if (hit && Date.now() - hit.at < NowPaymentsProvider.MIN_TTL_MS) return hit;
    try {
      const r = await httpJson<{ min_amount?: number; fiat_equivalent?: number }>(
        `${this.baseUrl}/min-amount?currency_from=${payCurrency}&fiat_equivalent=usd`,
        { headers: { "x-api-key": env.NOWPAYMENTS_API_KEY! }, timeoutMs: 8_000 },
      );
      const usd = Number(r.fiat_equivalent ?? 0);
      if (!(usd > 0)) return hit ?? null;
      const entry = { usd, usdt: Number(r.min_amount ?? usd), at: Date.now() };
      this.minCache.set(payCurrency, entry);
      return entry;
    } catch {
      return hit ?? null;
    }
  }

  /** Per-chain minimum order value in USD for the shop UI (chains with unknown minimum are omitted). */
  async chainMinimumsUsd(): Promise<Partial<Record<UsdtChain, number>>> {
    if (!this.enabled()) return {};
    const out: Partial<Record<UsdtChain, number>> = {};
    await Promise.all(
      (Object.keys(NOWPAYMENTS_CHAIN_CURRENCY) as UsdtChain[]).map(async (chain) => {
        const m = await this.chainMinimum(NOWPAYMENTS_CHAIN_CURRENCY[chain]);
        if (m) out[chain] = Math.ceil(m.usd * 100) / 100;
      }),
    );
    return out;
  }

  /** `GET /v1/payment/{id}` — used to backfill `payin_hash` when the IPN body omits it. */
  async fetchPayment(paymentId: string | number): Promise<{ payin_hash?: string | null; payment_status?: string } | null> {
    try {
      return await httpJson(`${this.baseUrl}/payment/${paymentId}`, {
        headers: { "x-api-key": env.NOWPAYMENTS_API_KEY! },
        timeoutMs: 8_000,
      });
    } catch {
      return null;
    }
  }
}
