"use client";

import { createTranslator, NextIntlClientProvider } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { create } from "zustand";
import { DEFAULT_LOCALE, type Locale } from "@bpredict/shared";
import zhHant from "../../messages/zh-Hant.json";
import en from "../../messages/en.json";

export type UiLocale = "zh-Hant" | "en";
export const UI_LOCALES: { id: UiLocale; label: string }[] = [
  { id: "zh-Hant", label: "繁體中文" },
  { id: "en", label: "English" },
];

const MESSAGES: Record<UiLocale, typeof zhHant> = { "zh-Hant": zhHant, en };
const STORAGE_KEY = "bp.locale";
export const TIME_ZONE = "Asia/Taipei";

/** Map any stored / server locale onto a catalog we ship (zh-Hans → zh-Hant for now). */
export function toUiLocale(l: string | null | undefined): UiLocale {
  if (!l) return DEFAULT_LOCALE as UiLocale;
  if (l.toLowerCase().startsWith("en")) return "en";
  return "zh-Hant";
}

function detect(): { locale: UiLocale; explicit: boolean } {
  if (typeof window === "undefined") return { locale: "zh-Hant", explicit: false };
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored) return { locale: toUiLocale(stored), explicit: true };
  const nav = window.navigator.language || "";
  return { locale: nav.toLowerCase().startsWith("zh") || !nav ? "zh-Hant" : "en", explicit: false };
}

interface LocaleState {
  locale: UiLocale;
  /** True once the user (or their profile) picked a language, so auto-detection no longer overrides it. */
  explicit: boolean;
  hydrated: boolean;
  hydrate(): void;
  /** User-initiated choice: persisted and never overridden. */
  setLocale(l: UiLocale): void;
  /** From the user's server profile; only applied when nothing explicit is stored locally. */
  adoptFromProfile(l: string): void;
}

export const useLocale = create<LocaleState>()((set, get) => ({
  locale: "zh-Hant",
  explicit: false,
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    set({ ...detect(), hydrated: true });
  },
  setLocale: (l) => {
    window.localStorage.setItem(STORAGE_KEY, l);
    set({ locale: l, explicit: true });
  },
  adoptFromProfile: (l) => {
    if (get().explicit) return;
    set({ locale: toUiLocale(l), explicit: true });
  },
}));

/** Translate outside React (stores, toasts). Uses the current locale at call time. */
export function tr(key: string, values?: Record<string, string | number | Date>): string {
  const locale = useLocale.getState().locale;
  const t = createTranslator({ locale, messages: MESSAGES[locale], timeZone: TIME_ZONE });
  return t(key as never, values as never);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const { locale, hydrate } = useLocale();
  useEffect(() => hydrate(), [hydrate]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone={TIME_ZONE} onError={() => undefined} getMessageFallback={({ key }) => key}>
      {children}
    </NextIntlClientProvider>
  );
}

/** Locale-aware date/time helpers (UTC+8 display, matching the reward day boundary). */
// English uses "Nov 5, 2026" rather than numeric DD/MM vs MM/DD, which reads differently per country.
export function fmtDate(d: string | number | Date, locale: UiLocale) {
  return locale === "en"
    ? new Date(d).toLocaleDateString("en-US", { timeZone: TIME_ZONE, year: "numeric", month: "short", day: "numeric" })
    : new Date(d).toLocaleDateString("zh-TW", { timeZone: TIME_ZONE });
}
export function fmtDateTime(d: string | number | Date, locale: UiLocale) {
  return locale === "en"
    ? new Date(d).toLocaleString("en-US", { timeZone: TIME_ZONE, year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    : new Date(d).toLocaleString("zh-TW", { timeZone: TIME_ZONE, hour12: false });
}
export type { Locale };
