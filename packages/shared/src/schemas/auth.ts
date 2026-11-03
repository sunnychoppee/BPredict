import { z } from "zod";

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

export const devLoginSchema = z.object({
  nickname: z.string().min(1).max(32),
});
export type DevLoginInput = z.infer<typeof devLoginSchema>;
