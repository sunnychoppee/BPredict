"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/** Root error boundary: reports render crashes and offers a reload (replaces the whole document). */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="zh-Hant">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#071f18", color: "#f4e8c1", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ textAlign: "center", padding: 24, border: "1px solid rgba(201,162,77,.5)", borderRadius: 12, background: "#0b3d2e" }}>
          <p style={{ fontSize: 18, margin: "0 0 12px" }}>頁面發生錯誤 / Something went wrong</p>
          {error.digest && <p style={{ fontSize: 11, opacity: 0.6, margin: "0 0 12px" }}>ref {error.digest}</p>}
          <button onClick={() => reset()} style={{ padding: "8px 18px", borderRadius: 999, border: "1px solid #e8c97a", background: "transparent", color: "#e8c97a", cursor: "pointer" }}>
            重新載入 / Reload
          </button>
        </div>
      </body>
    </html>
  );
}
