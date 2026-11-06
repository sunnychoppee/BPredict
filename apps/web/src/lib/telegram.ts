export interface TelegramInset {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface TelegramWebApp {
  initData: string;
  version: string;
  colorScheme: "light" | "dark";
  platform: string;
  isFullscreen?: boolean;
  /** Device safe area (notch / home indicator) — Bot API 8.0+. */
  safeAreaInset?: TelegramInset;
  /** Area covered by Telegram's own header controls in fullscreen mode — Bot API 8.0+. */
  contentSafeAreaInset?: TelegramInset;
  ready(): void;
  expand(): void;
  close(): void;
  isVersionAtLeast(v: string): boolean;
  requestFullscreen?(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  setBottomBarColor?(color: string): void;
  disableVerticalSwipes?(): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  onEvent(event: string, handler: () => void): void;
  offEvent(event: string, handler: () => void): void;
  BackButton: { isVisible: boolean; show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
    selectionChanged(): void;
  };
  /** Opens a Bot API invoice link (Telegram Stars). */
  openInvoice?(url: string, callback?: (status: "paid" | "cancelled" | "failed" | "pending") => void): void;
  openLink?(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink?(url: string): void;
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

export const inTelegram = () => getTelegramWebApp() !== null;

/** Applies our theme (per UI mode) regardless of the user's Telegram colour scheme and wires safe areas. */
export function setupTelegramChrome(wa: TelegramWebApp) {
  try {
    wa.ready();
    wa.expand();
    const fresh = document.documentElement.dataset.mode === "fresh";
    wa.setHeaderColor(fresh ? "#FFFFFF" : "#0B3D2E");
    wa.setBackgroundColor(fresh ? "#F4F6FA" : "#071F18");
    wa.setBottomBarColor?.(fresh ? "#FFFFFF" : "#071F18");
    wa.disableVerticalSwipes?.();
    // Fullscreen hides Telegram's own header, so our top bar needs the content inset (see applySafeArea).
    if ((wa.platform === "ios" || wa.platform === "android") && wa.isVersionAtLeast("8.0")) wa.requestFullscreen?.();
  } catch {
    /* older clients lack some methods */
  }
  applySafeArea(wa);
  const onChange = () => applySafeArea(wa);
  for (const ev of ["safeAreaChanged", "contentSafeAreaChanged", "fullscreenChanged", "viewportChanged"]) {
    try {
      wa.onEvent(ev, onChange);
    } catch {
      /* unsupported event */
    }
  }
}

/**
 * Telegram reports insets via JS, not `env(safe-area-inset-*)`, so push them into the CSS variables the
 * layout already uses. Outside fullscreen both insets are 0 and the CSS fallbacks stay in effect.
 */
function applySafeArea(wa: TelegramWebApp) {
  const root = document.documentElement;
  const sa = wa.safeAreaInset;
  const ca = wa.contentSafeAreaInset;
  if (!sa && !ca) return;
  const top = (sa?.top ?? 0) + (ca?.top ?? 0);
  const bottom = (sa?.bottom ?? 0) + (ca?.bottom ?? 0);
  root.style.setProperty("--safe-top", `${top}px`);
  root.style.setProperty("--safe-bottom", `${bottom}px`);
}

/** Haptics: no-op outside Telegram or on clients without the API. */
export const haptic = {
  impact(style: "light" | "medium" | "heavy" = "light") {
    try {
      getTelegramWebApp()?.HapticFeedback?.impactOccurred(style);
    } catch {
      /* ignore */
    }
  },
  notify(type: "success" | "error" | "warning") {
    try {
      getTelegramWebApp()?.HapticFeedback?.notificationOccurred(type);
    } catch {
      /* ignore */
    }
  },
};

/** Ask Telegram to confirm before closing the Mini App (used while the user has live bets). */
export function setClosingConfirmation(on: boolean) {
  const wa = getTelegramWebApp();
  if (!wa) return;
  try {
    if (on) wa.enableClosingConfirmation();
    else wa.disableClosingConfirmation();
  } catch {
    /* ignore */
  }
}
