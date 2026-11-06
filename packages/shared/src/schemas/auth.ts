import { z } from "zod";
import { LOCALES, UI_MODES } from "../constants";

export const telegramAuthSchema = z.object({
  initData: z.string().min(1).max(8192),
});
export type TelegramAuthInput = z.infer<typeof telegramAuthSchema>;

export const emailRequestSchema = z.object({
  email: z.string().email().max(254),
});
export type EmailRequestInput = z.infer<typeof emailRequestSchema>;

export const emailVerifySchema = z.object({
  token: z.string().min(32).max(256),
});
export type EmailVerifyInput = z.infer<typeof emailVerifySchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(32).max(512),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const updateMeSchema = z
  .object({
    nickname: z.string().trim().min(2).max(24).optional(),
    locale: z.enum(LOCALES).optional(),
    uiMode: z.enum(UI_MODES).optional(),
  })
  .refine((o) => o.nickname !== undefined || o.locale !== undefined || o.uiMode !== undefined, "nothing to update");
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

export const devLoginSchema = z.object({
  nickname: z.string().min(1).max(32),
});
export type DevLoginInput = z.infer<typeof devLoginSchema>;
