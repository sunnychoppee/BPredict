import { z } from "zod";

export type ProductType = "COINS" | "GEMS" | "VIP";
export type PaymentProviderId = "NOWPAYMENTS" | "STRIPE" | "TELEGRAM_STARS" | "DEV";
export type PaymentStatus = "PENDING" | "PAID" | "PARTIALLY_PAID" | "EXPIRED" | "FAILED" | "REFUNDED";

export const USDT_CHAINS = ["TRC20", "BEP20", "TON"] as const;
export type UsdtChain = (typeof USDT_CHAINS)[number];

export interface ProductView {
  id: string;
  type: ProductType;
  name: string;
  priceUsdt: number;
  priceStars: number;
  coins: number;
  gems: number;
  bonusPct: number;
  vipDays: number;
}

export interface ShopView {
  products: ProductView[];
  /** Channels the server can actually take orders for right now. */
  channels: { id: PaymentProviderId; label: string; enabled: boolean; note?: string }[];
  usdtChains: readonly UsdtChain[];
  firstChargeAvailable: boolean;
  firstChargeMultiplier: number;
  isVip: boolean;
  vipExpiresAt: string | null;
  vipDailyCoins: number;
}

export interface PaymentView {
  id: string;
  productId: string;
  productName: string;
  provider: PaymentProviderId;
  status: PaymentStatus;
  priceUsdt: number;
  chain: string | null;
  creditedCoins: number;
  creditedGems: number;
  firstCharge: boolean;
  payUrl: string | null;
  createdAt: string;
  paidAt: string | null;
  expiresAt: string | null;
}

export interface CreateOrderResult {
  payment: PaymentView;
  /** How the client should proceed. */
  next: { kind: "redirect"; url: string } | { kind: "telegram_invoice"; url: string } | { kind: "done" };
}

export const createOrderSchema = z.object({
  productId: z.string().min(1).max(64),
  provider: z.enum(["NOWPAYMENTS", "STRIPE", "TELEGRAM_STARS", "DEV"]),
  chain: z.enum(USDT_CHAINS).optional(),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
