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
  | "VIP_DAILY"
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
  /** "casino" | "fresh" — see UI_MODES. */
  uiMode: string;
  isVip: boolean;
  vipExpiresAt: string | null;
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
  /** True when one of the user's identities is in ADMIN_EMAILS (ops console access). */
  isAdmin: boolean;
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
