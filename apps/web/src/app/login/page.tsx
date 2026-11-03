"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AuthTokens } from "@bpredict/shared";
import { api, API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";

const ERRORS: Record<string, string> = {
  google_denied: "你取消了 Google 登入。",
  oauth_state: "登入逾時，請重試。",
  google_rejected: "Google 帳號未通過驗證。",
  google_failed: "Google 登入失敗，請稍後再試。",
};

const isLocal = process.env.NEXT_PUBLIC_APP_ENV === undefined || process.env.NEXT_PUBLIC_APP_ENV === "local";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { accessToken, hydrated, setTokens } = useAuth();
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const err = params.get("error");

  useEffect(() => {
    if (hydrated && accessToken) router.replace("/");
  }, [hydrated, accessToken, router]);

  async function requestEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ sent: boolean; devLink?: string }>("/auth/email/request", { method: "POST", body: JSON.stringify({ email }) }, false);
      setMsg(r.sent ? "登入連結已寄出，請查看信箱（15 分鐘內有效）。" : "開發模式：未設定郵件服務，使用下方連結。");
      setDevLink(r.devLink ?? null);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function devLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      setTokens(await api<AuthTokens>("/auth/dev", { method: "POST", body: JSON.stringify({ nickname }) }, false));
      router.replace("/");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="felt-surface gold-frame w-full max-w-sm rounded-2xl p-6">
        <h1 className="font-display text-center text-2xl text-gold">登入</h1>
        <p className="mt-1 text-center text-xs text-cream/60">虛擬金幣 · 純娛樂 · 18+</p>

        {err && <div className="mt-4 rounded-md border border-banker/60 bg-banker/20 p-2 text-sm">{ERRORS[err] ?? "登入失敗。"}</div>}

        <a href={`${API_URL}/auth/google`} className="btn-gold mt-6 block w-full text-center">
          使用 Google 登入
        </a>

        <div className="my-5 flex items-center gap-3 text-xs text-cream/40">
          <div className="h-px flex-1 bg-gold/30" />
          或
          <div className="h-px flex-1 bg-gold/30" />
        </div>

        <form onSubmit={requestEmail} className="space-y-3">
          <input className="input" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn-outline w-full" disabled={busy}>
            寄送登入連結
          </button>
        </form>

        {msg && <div className="mt-3 text-sm text-cream/80">{msg}</div>}
        {devLink && (
          <a className="mt-1 block break-all text-xs text-gold-bright underline" href={devLink}>
            {devLink}
          </a>
        )}

        {isLocal && (
          <form onSubmit={devLogin} className="mt-6 space-y-2 border-t border-gold/20 pt-4">
            <div className="text-xs text-cream/50">本機開發登入（APP_ENV=local 才有效）</div>
            <div className="flex gap-2">
              <input className="input" placeholder="暱稱" value={nickname} onChange={(e) => setNickname(e.target.value)} required maxLength={32} />
              <button className="btn-outline whitespace-nowrap" disabled={busy}>
                進入
              </button>
            </div>
          </form>
        )}

        <p className="mt-6 text-center text-[11px] leading-relaxed text-cream/40">
          在 Telegram 中開啟{" "}
          <a className="underline" href={`https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "BacPredict_bot"}`}>
            @{process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "BacPredict_bot"}
          </a>{" "}
          可免登入直接遊玩。
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
