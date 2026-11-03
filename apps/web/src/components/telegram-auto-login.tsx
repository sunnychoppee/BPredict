"use client";

import { useEffect, useRef, useState } from "react";
import type { AuthTokens } from "@bpredict/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { getTelegramWebApp, setupTelegramChrome } from "@/lib/telegram";

/**
 * Inside Telegram: exchanges initData for tokens on first load. Outside Telegram: renders nothing.
 */
export function TelegramAutoLogin() {
  const { accessToken, hydrated, setTokens } = useAuth();
  const [status, setStatus] = useState<"idle" | "pending" | "failed">("idle");
  const attempted = useRef(false);

  useEffect(() => {
    const wa = getTelegramWebApp();
    if (!wa) return;
    setupTelegramChrome(wa);
    if (!hydrated || accessToken || attempted.current) return;
    attempted.current = true;
    setStatus("pending");
    api<AuthTokens>("/auth/telegram", { method: "POST", body: JSON.stringify({ initData: wa.initData }) }, false)
      .then((t) => {
        setTokens(t);
        setStatus("idle");
      })
      .catch(() => setStatus("failed"));
  }, [hydrated, accessToken, setTokens]);

  if (status === "idle") return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-felt-dark/90">
      <div className="gold-frame rounded-lg bg-felt px-6 py-4 text-center">
        {status === "pending" ? "正在以 Telegram 帳號登入…" : "Telegram 登入失敗，請重新開啟 Mini App。"}
      </div>
    </div>
  );
}
