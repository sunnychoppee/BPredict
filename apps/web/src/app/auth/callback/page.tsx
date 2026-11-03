"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-store";

/** Google OAuth lands here with tokens in the URL fragment (never sent to the server). */
export default function AuthCallbackPage() {
  const router = useRouter();
  const setTokens = useAuth((s) => s.setTokens);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const frag = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const access = frag.get("access");
    const refresh = frag.get("refresh");
    const exp = Number(frag.get("exp") ?? 900);
    if (!access || !refresh) {
      setFailed(true);
      return;
    }
    setTokens({ accessToken: access, refreshToken: refresh, accessExpiresIn: exp });
    history.replaceState(null, "", "/auth/callback");
    router.replace("/");
  }, [router, setTokens]);

  return (
    <main className="flex min-h-screen items-center justify-center text-sm text-cream/70">
      {failed ? (
        <span>
          登入資料不完整。<a className="underline" href="/login">返回登入</a>
        </span>
      ) : (
        "登入中…"
      )}
    </main>
  );
}
