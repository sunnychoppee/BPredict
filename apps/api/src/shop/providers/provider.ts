import type { Payment, Product } from "@bpredict/db";
import type { CreateOrderResult, PaymentProviderId, UsdtChain } from "@bpredict/shared";

export interface CheckoutContext {
  payment: Payment;
  product: Product;
  userId: string;
  chain?: UsdtChain;
}

export interface CheckoutResult {
  /** Provider-side identifier (invoice / session id). Null when it only becomes known on success (Stars). */
  providerOrderId: string | null;
  payUrl: string | null;
  expiresAt?: Date;
  meta?: Record<string, unknown>;
  next: CreateOrderResult["next"];
}

/** One payment channel. Webhook handling lives in `WebhooksController` → `ShopService.settle`. */
export interface PaymentProviderAdapter {
  readonly id: PaymentProviderId;
  readonly label: string;
  readonly note?: string;
  enabled(): boolean;
  createCheckout(ctx: CheckoutContext): Promise<CheckoutResult>;
}

/** Thin fetch wrapper: JSON in / JSON out with a timeout and a readable error. */
export async function httpJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 15_000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
    return (text ? JSON.parse(text) : {}) as T;
  } finally {
    clearTimeout(timer);
  }
}
