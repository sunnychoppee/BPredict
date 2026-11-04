import { z } from "zod";
import type { Currency, LedgerType } from "./types";
import type { PaymentProviderId, PaymentStatus } from "./shop";

export interface AdminOverview {
  generatedAt: number;
  users: { total: number; newToday: number; activeToday: number; vip: number; frozen: number };
  coins: { circulating: number; issuedToday: number; recoveredToday: number };
  rounds: { settledToday: number; voidedToday: number; stakedToday: number; feeToday: number };
  payments: { paidToday: number; usdtToday: number; paidTotal: number; usdtTotal: number; pending: number };
}

export interface AdminUserRow {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  locale: string;
  isVip: boolean;
  vipExpiresAt: string | null;
  frozenAt: string | null;
  createdAt: string;
  identities: { provider: string; email: string | null; providerUid: string }[];
  balances: { currency: Currency; amount: number }[];
  stats: { totalRounds: number; wins: number; currentStreak: number; maxStreak: number; netProfit: number } | null;
  paidUsdt: number;
}

export interface AdminLedgerRow {
  id: string;
  type: LedgerType;
  currency: Currency;
  amount: number;
  balanceAfter: number;
  refType: string | null;
  refId: string | null;
  createdAt: string;
}

export interface AdminPaymentRow {
  id: string;
  userId: string;
  nickname: string;
  productId: string;
  provider: PaymentProviderId;
  status: PaymentStatus;
  priceUsdt: number;
  paidAmount: number | null;
  asset: string | null;
  chain: string | null;
  creditedCoins: number;
  creditedGems: number;
  firstCharge: boolean;
  createdAt: string;
  paidAt: string | null;
}

export interface AdminRoundRow {
  id: string;
  roundNo: number;
  status: string;
  lockPrice: number | null;
  closePrice: number | null;
  winner: string | null;
  poolBanker: number;
  poolPlayer: number;
  fee: number;
  destroyed: number;
  bettors: number;
  closeAt: string;
  voidReason: string | null;
}

export interface AdminActionRow {
  id: string;
  adminUserId: string;
  adminNickname: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  payload: unknown;
  createdAt: string;
}

export const adminAdjustSchema = z.object({
  currency: z.enum(["COINS", "GEMS"]),
  /** Positive credits, negative debits. */
  amount: z.number().int().refine((n) => n !== 0, "amount must be non-zero").refine((n) => Math.abs(n) <= 100_000_000, "amount too large"),
  reason: z.string().min(2).max(200),
});
export type AdminAdjustInput = z.infer<typeof adminAdjustSchema>;

export const adminFreezeSchema = z.object({ frozen: z.boolean(), reason: z.string().min(2).max(200) });
export type AdminFreezeInput = z.infer<typeof adminFreezeSchema>;

export const adminVipSchema = z.object({ days: z.number().int().min(-3650).max(3650), reason: z.string().min(2).max(200) });
export type AdminVipInput = z.infer<typeof adminVipSchema>;

export const adminEconomySchema = z.object({
  key: z.string().min(1).max(64),
  value: z.unknown(),
});
export type AdminEconomyInput = z.infer<typeof adminEconomySchema>;

export const adminProductSchema = z.object({
  enabled: z.boolean().optional(),
  priceUsdt: z.number().positive().max(100_000).optional(),
  priceStars: z.number().int().positive().max(10_000_000).optional(),
  name: z.string().min(1).max(64).optional(),
  sortOrder: z.number().int().optional(),
});
export type AdminProductInput = z.infer<typeof adminProductSchema>;
