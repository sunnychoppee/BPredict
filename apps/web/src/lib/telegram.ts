export interface TelegramWebApp {
  initData: string;
  colorScheme: "light" | "dark";
  platform: string;
  ready(): void;
  expand(): void;
  requestFullscreen?(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  setBottomBarColor?(color: string): void;
  disableVerticalSwipes?(): void;
  /** Opens a Bot API invoice link (Telegram Stars). */
  openInvoice?(url: string, callback?: (status: "paid" | "cancelled" | "failed" | "pending") => void): void;
  openLink?(url: string, options?: { try_instant_view?: boolean }): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const wa = window.Telegram?.WebApp;
  return wa && wa.initData ? wa : null;
}

/** Applies the casino theme regardless of the user's Telegram colour scheme. */
export function setupTelegramChrome(wa: TelegramWebApp) {
  try {
    wa.ready();
    wa.expand();
    wa.setHeaderColor("#0B3D2E");
    wa.setBackgroundColor("#071F18");
    wa.setBottomBarColor?.("#071F18");
    wa.disableVerticalSwipes?.();
    if (wa.platform === "ios" || wa.platform === "android") wa.requestFullscreen?.();
  } catch {
    /* older clients lack some methods */
  }
}
