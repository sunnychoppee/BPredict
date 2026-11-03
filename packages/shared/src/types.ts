export type Side = "BANKER" | "PLAYER";
export type RoundStatus = "SCHEDULED" | "BETTING" | "LOCKED" | "SETTLED" | "VOIDED";
export type Currency = "COINS" | "GEMS";
export type AuthProvider = "TELEGRAM" | "GOOGLE" | "EMAIL";

export type LedgerType =
  | "WELCOME"
  | "DAILY_CHECKIN"
  | "TIMED_SUPPLY"
  | "RELIEF"
  | "REFERRAL"
  | "BET"
  | "BET_CANCEL"
  | "PAYOUT"
  | "REFUND"
  | "PURCHASE"
  | "ADMIN_ADJUST";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
}

export interface PublicUser {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  locale: string;
  isVip: boolean;
  createdAt: string;
}

export interface BalanceView {
  currency: Currency;
  amount: number;
}

export interface MeResponse {
  user: PublicUser;
  balances: BalanceView[];
  identities: { provider: AuthProvider; email: string | null }[];
}

export interface LedgerEntryView {
  id: string;
  currency: Currency;
  amount: number;
  type: LedgerType;
  refType: string | null;
  refId: string | null;
  balanceAfter: number;
  createdAt: string;
}
