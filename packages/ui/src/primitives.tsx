"use client";

import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export function GoldButton({ className = "", variant = "solid", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "outline" | "ghost" }) {
  const base = "inline-flex items-center justify-center gap-1 rounded-md px-4 py-2 text-sm font-semibold transition active:translate-y-px disabled:opacity-50 disabled:active:translate-y-0";
  const v =
    variant === "solid"
      ? "bg-gradient-to-b from-gold-bright to-gold text-felt-dark shadow-[0_2px_0_#8a6a25,0_6px_14px_rgba(0,0,0,.35)] hover:brightness-110"
      : variant === "outline"
        ? "border border-gold/70 text-cream hover:border-gold-bright hover:text-gold-bright"
        : "text-cream/70 hover:text-gold-bright";
  return <button className={`${base} ${v} ${className}`} {...rest} />;
}

/** Felt panel with gold frame and inner vignette. */
export function Panel({ className = "", children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`felt-surface gold-frame relative overflow-hidden rounded-2xl ${className}`} {...rest}>
      <div className="pointer-events-none absolute inset-0 bg-vignette" />
      <div className="relative">{children}</div>
    </div>
  );
}

/** Dark card used on secondary pages. */
export function Card({ className = "", title, children, ...rest }: HTMLAttributes<HTMLDivElement> & { title?: ReactNode }) {
  return (
    <div className={`rounded-xl border border-gold/30 bg-felt-dark/70 p-4 ${className}`} {...rest}>
      {title && <div className="mb-2 font-display text-sm tracking-wide text-gold">{title}</div>}
      {children}
    </div>
  );
}

export function Pill({ tone = "gold", className = "", ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: "gold" | "banker" | "player" | "void" }) {
  const t = { gold: "border-gold/60 bg-gold/15 text-gold-bright", banker: "border-banker/60 bg-banker/20 text-banker", player: "border-player/60 bg-player/20 text-player", void: "border-void/60 bg-void/20 text-cream/70" }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-none ${t} ${className}`} {...rest} />;
}

export const fmt = (n: number) => n.toLocaleString("en-US");
export const fmtPx = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const mmss = (secs: number) => `${Math.floor(Math.max(0, secs) / 60)}:${String(Math.max(0, secs) % 60).padStart(2, "0")}`;
