import { Injectable } from "@nestjs/common";
import { isProduction } from "../../config/env";
import type { CheckoutContext, CheckoutResult, PaymentProviderAdapter } from "./provider";

/**
 * Test-only channel: the order is settled immediately by `ShopService` after creation.
 * Never enabled in production (guarded here and again in `ShopService`).
 */
@Injectable()
export class DevProvider implements PaymentProviderAdapter {
  readonly id = "DEV" as const;
  readonly label = "測試支付";
  readonly note = "UAT 專用，立即到帳";

  enabled(): boolean {
    return !isProduction;
  }

  async createCheckout(ctx: CheckoutContext): Promise<CheckoutResult> {
    return {
      providerOrderId: `dev_${ctx.payment.id}`,
      payUrl: null,
      meta: { dev: true },
      next: { kind: "done" },
    };
  }
}
