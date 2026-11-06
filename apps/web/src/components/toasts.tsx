"use client";

import { useTable } from "@/lib/table-store";

const styles: Record<string, string> = {
  win: "border-gold bg-felt-dark/95 text-gold-bright shadow-glow",
  lose: "border-cream/30 bg-felt-dark/95 text-cream/80",
  void: "border-void bg-felt-dark/95 text-cream/80",
  info: "border-gold/50 bg-felt-dark/95 text-cream",
  error: "border-neg bg-felt-dark/95 text-neg",
};

export function Toasts() {
  const { toasts, dismissToast } = useTable();
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 z-40 flex flex-col items-center gap-2 px-4" style={{ top: "calc(var(--safe-top) + 3.5rem)" }}>
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismissToast(t.id)}
          className={`pointer-events-auto w-full max-w-sm rounded-lg border px-4 py-2.5 text-left text-sm backdrop-blur animate-fadein ${styles[t.kind]}`}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
