export const TABLE_ID_BTC = "btc-updown";
export const ROUND_SECONDS = 300;

export const LOCALES = ["zh-Hant", "en", "zh-Hans"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "zh-Hant";

/** UI skins: `casino` = 莊/閒 gold felt (original), `fresh` = 漲/跌 light modern. */
export const UI_MODES = ["casino", "fresh"] as const;
export type UiMode = (typeof UI_MODES)[number];
export const DEFAULT_UI_MODE: UiMode = "casino";

export const ACCESS_TOKEN_TTL_SEC = 15 * 60;
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;
export const MAGIC_LINK_TTL_SEC = 15 * 60;
export const TELEGRAM_INITDATA_MAX_AGE_SEC = 5 * 60;
