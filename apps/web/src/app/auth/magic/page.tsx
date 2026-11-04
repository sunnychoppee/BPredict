"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { AuthTokens } from "@bpredict/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";

function MagicInner() {
  const t = useTranslations("login");
  const router = useRouter();
  const params = useSearchParams();
  const setTokens = useAuth((s) => s.setTokens);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    const token = params.get("token");
    if (!token || done.current) return;
    done.current = true;
    api<AuthTokens>("/auth/email/verify", { method: "POST", body: JSON.stringify({ token }) }, false)
      .then((t) => {
        setTokens(t);
        router.replace("/");
      })
      .catch((e: Error) => setError(e.message));
  }, [params, router, setTokens]);

  return (
    <main className="flex min-h-screen items-center justify-center text-sm text-cream/70">
      {error ? (
        <span>
          {t("magicInvalid")}{" "}
          <a className="underline" href="/login">
            {t("relogin")}
          </a>
        </span>
      ) : (
        t("verifying")
      )}
    </main>
  );
}

export default function MagicPage() {
  return (
    <Suspense>
      <MagicInner />
    </Suspense>
  );
}
