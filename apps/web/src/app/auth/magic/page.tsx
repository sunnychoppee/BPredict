"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AuthTokens } from "@bpredict/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";

function MagicInner() {
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
          連結無效或已過期。<a className="underline" href="/login">重新登入</a>
        </span>
      ) : (
        "驗證中…"
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
