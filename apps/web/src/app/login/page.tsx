"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { AuthTokens } from "@bpredict/shared";
import { api, API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { UI_LOCALES, useLocale } from "@/lib/i18n";

const ERROR_KEYS = ["google_denied", "oauth_state", "google_rejected", "google_failed"] as const;

const isLocal = process.env.NEXT_PUBLIC_APP_ENV === undefined || process.env.NEXT_PUBLIC_APP_ENV === "local";
const BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "BacPredict_bot";

function LoginInner() {
  const t = useTranslations("login");
  const router = useRouter();
  const params = useSearchParams();
  const { accessToken, hydrated, setTokens } = useAuth();
  const { locale, setLocale } = useLocale();
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
      setMsg(r.sent ? t("sent") : t("devNoMail"));
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

  const errText = err ? ((ERROR_KEYS as readonly string[]).includes(err) ? t(`err_${err}` as "err_google_denied") : t("failed")) : null;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="felt-surface gold-frame w-full max-w-sm rounded-2xl p-6">
        <div className="flex justify-end gap-1 text-[11px]">
          {UI_LOCALES.map((l) => (
            <button key={l.id} onClick={() => setLocale(l.id)} className={`rounded px-1.5 py-0.5 ${locale === l.id ? "bg-gold/20 text-gold-bright" : "text-cream/50 hover:text-cream"}`}>
              {l.label}
            </button>
          ))}
        </div>
        <h1 className="font-display text-center text-2xl text-gold">{t("title")}</h1>
        <p className="mt-1 text-center text-xs text-cream/60">{t("tagline")}</p>

        {errText && <div className="mt-4 rounded-md border border-banker/60 bg-banker/20 p-2 text-sm">{errText}</div>}

        <a href={`${API_URL}/auth/google`} className="btn-gold mt-6 block w-full text-center">
          {t("google")}
        </a>

        <div className="my-5 flex items-center gap-3 text-xs text-cream/40">
          <div className="h-px flex-1 bg-gold/30" />
          {t("or")}
          <div className="h-px flex-1 bg-gold/30" />
        </div>

        <form onSubmit={requestEmail} className="space-y-3">
          <input className="input" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn-outline w-full" disabled={busy}>
            {t("sendLink")}
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
            <div className="text-xs text-cream/50">{t("devTitle")}</div>
            <div className="flex gap-2">
              <input className="input" placeholder={t("nickname")} value={nickname} onChange={(e) => setNickname(e.target.value)} required maxLength={32} />
              <button className="btn-outline whitespace-nowrap" disabled={busy}>
                {t("enter")}
              </button>
            </div>
          </form>
        )}

        <p className="mt-6 text-center text-[11px] leading-relaxed text-cream/40">
          {t("telegramHint1")}{" "}
          <a className="underline" href={`https://t.me/${BOT}`}>
            @{BOT}
          </a>{" "}
          {t("telegramHint2")}
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
