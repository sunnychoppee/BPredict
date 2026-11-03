export const TABLE_ID_BTC = "btc-updown";
export const ROUND_SECONDS = 300;

export const LOCALES = ["zh-Hant", "en", "zh-Hans"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "zh-Hant";

export const ACCESS_TOKEN_TTL_SEC = 15 * 60;
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;
export const MAGIC_LINK_TTL_SEC = 15 * 60;
export const TELEGRAM_INITDATA_MAX_AGE_SEC = 5 * 60;
