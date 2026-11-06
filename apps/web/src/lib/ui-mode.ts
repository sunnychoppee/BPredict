"use client";

import { create } from "zustand";
import { DEFAULT_UI_MODE, UI_MODES, type UiMode } from "@bpredict/shared";
import { sound } from "@bpredict/ui";

export type { UiMode };
export const STORAGE_KEY = "bp.mode";

/** Theme colour reported to the browser / Telegram chrome per mode. */
export const MODE_THEME_COLOR: Record<UiMode, { bg: string; header: string }> = {
  casino: { bg: "#071F18", header: "#071F18" },
  fresh: { bg: "#F4F6FA", header: "#FFFFFF" },
};

export function toUiMode(m: string | null | undefined): UiMode {
  return (UI_MODES as readonly string[]).includes(m ?? "") ? (m as UiMode) : DEFAULT_UI_MODE;
}

/** Applies the mode to <html> (data attribute drives the CSS tokens) and to browser / Telegram chrome. */
export function applyMode(mode: UiMode) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.mode = mode;
  sound().setTheme(mode === "fresh" ? "soft" : "casino");
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = MODE_THEME_COLOR[mode].bg;
  const wa = (window as unknown as { Telegram?: { WebApp?: { setHeaderColor?(c: string): void; setBackgroundColor?(c: string): void; setBottomBarColor?(c: string): void } } }).Telegram?.WebApp;
  try {
    wa?.setHeaderColor?.(MODE_THEME_COLOR[mode].header);
    wa?.setBackgroundColor?.(MODE_THEME_COLOR[mode].bg);
    wa?.setBottomBarColor?.(MODE_THEME_COLOR[mode].header);
  } catch {
    /* older clients */
  }
}

interface UiModeState {
  mode: UiMode;
  /** True once the user (or their profile) picked a mode, so the profile no longer overrides it. */
  explicit: boolean;
  hydrated: boolean;
  hydrate(): void;
  /** User-initiated choice: persisted locally and never overridden. */
  setMode(m: UiMode): void;
  /** From the user's server profile; only applied when nothing explicit is stored locally. */
  adoptFromProfile(m: string | null | undefined): void;
}

export const useUiMode = create<UiModeState>()((set, get) => ({
  mode: DEFAULT_UI_MODE,
  explicit: false,
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    const mode = toUiMode(stored);
    applyMode(mode);
    set({ mode, explicit: !!stored, hydrated: true });
  },
  setMode: (m) => {
    window.localStorage.setItem(STORAGE_KEY, m);
    applyMode(m);
    set({ mode: m, explicit: true });
  },
  adoptFromProfile: (m) => {
    if (get().explicit || !m) return;
    const mode = toUiMode(m);
    applyMode(mode);
    set({ mode, explicit: true });
  },
}));

export const isFresh = () => useUiMode.getState().mode === "fresh";
