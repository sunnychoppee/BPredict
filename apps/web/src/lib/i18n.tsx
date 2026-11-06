"use client";

import { createTranslator, NextIntlClientProvider } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { create } from "zustand";
import { DEFAULT_LOCALE, type Locale } from "@bpredict/shared";
import zhHant from "../../messages/zh-Hant.json";
import en from "../../messages/en.json";
import zhHantFresh from "../../messages/zh-Hant.fresh.json";
import enFresh from "../../messages/en.fresh.json";
import { useUiMode, type UiMode } from "./ui-mode";

export type UiLocale = "zh-Hant" | "en";
export const UI_LOCALES: { id: UiLocale; label: string }[] = [
  { id: "zh-Hant", label: "繁體中文" },
  { id: "en", label: "English" },
];

type Messages = typeof zhHant;
type Partial2<T> = { [K in keyof T]?: T[K] extends object ? Partial2<T[K]> : T[K] };

const BASE: Record<UiLocale, Messages> = { "zh-Hant": zhHant, en };
/** 簡約漲跌 wording overrides (預測 / 行情 / 漲跌 instead of 下注 / 牌桌 / 莊閒). Partial; merged over BASE. */
const FRESH: Record<UiLocale, Partial2<Messages>> = { "zh-Hant": zhHantFresh as Partial2<Messages>, en: enFresh as Partial2<Messages> };

function deepMerge<T extends object>(base: T, over: Partial2<T> | undefined): T {
  if (!over) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    const b = out[k];
    out[k] = v && typeof v === "object" && b && typeof b === "object" ? deepMerge(b as object, v as Partial2<object>) : v;
  }
  return out as T;
}

const cache = new Map<string, Messages>();
export function messagesFor(locale: UiLocale, mode: UiMode): Messages {
  const key = `${locale}:${mode}`;
  let m = cache.get(key);
  if (!m) {
    m = mode === "fresh" ? deepMerge(BASE[locale], FRESH[locale]) : BASE[locale];
    cache.set(key, m);
  }
  return m;
}

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
  const t = createTranslator({ locale, messages: messagesFor(locale, useUiMode.getState().mode), timeZone: TIME_ZONE });
  return t(key as never, values as never);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const { locale, hydrate } = useLocale();
  const mode = useUiMode((s) => s.mode);
  const hydrateMode = useUiMode((s) => s.hydrate);
  useEffect(() => {
    hydrate();
    hydrateMode();
  }, [hydrate, hydrateMode]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <NextIntlClientProvider locale={locale} messages={messagesFor(locale, mode)} timeZone={TIME_ZONE} onError={() => undefined} getMessageFallback={({ key }) => key}>
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
