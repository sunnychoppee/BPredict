"use client";

import type { CSSProperties } from "react";

/** Casino chip palette by denomination (fallbacks for unknown values). */
const PALETTE: Record<number, { base: string; dark: string; text: string }> = {
  100: { base: "#9aa0a6", dark: "#5f6368", text: "#111" },
  500: { base: "#b3252d", dark: "#6e1218", text: "#fff" },
  1000: { base: "#1f4e9a", dark: "#102a55", text: "#fff" },
  5000: { base: "#2e7d4f", dark: "#174228", text: "#fff" },
  10000: { base: "#5a2d82", dark: "#2f1545", text: "#fff" },
  50000: { base: "#1a1a1a", dark: "#000", text: "#e8c97a" },
};

export const chipLabel = (d: number) => (d >= 1000 ? `${d / 1000}k` : String(d));

export interface ChipProps {
  value: number;
  size?: number;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  /** Render as a static disc (no button semantics) — used for stacks. */
  flat?: boolean;
}

/** 2D chip with metallic gold rim and eight edge stripes; no 3D libs. */
export function Chip({ value, size = 48, selected, disabled, onClick, className = "", style, flat }: ChipProps) {
  const p = PALETTE[value] ?? { base: "#c9a24d", dark: "#7a5f26", text: "#111" };
  const r = 50;
  const stripes = Array.from({ length: 8 }, (_, i) => i * 45);
  const svg = (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      <defs>
        <radialGradient id={`chip-face-${value}`} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor={p.base} />
          <stop offset="100%" stopColor={p.dark} />
        </radialGradient>
        <linearGradient id="chip-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f3dc9a" />
          <stop offset="50%" stopColor="#c9a24d" />
          <stop offset="100%" stopColor="#8a6a25" />
        </linearGradient>
      </defs>
      <circle cx={r} cy={r} r={49} fill={`url(#chip-face-${value})`} stroke="url(#chip-gold)" strokeWidth={2.5} />
      {stripes.map((a) => (
        <rect key={a} x={44} y={2} width={12} height={13} rx={2} fill="#f4e8c1" opacity={0.92} transform={`rotate(${a} 50 50)`} />
      ))}
      <circle cx={r} cy={r} r={33} fill="none" stroke="url(#chip-gold)" strokeWidth={2} />
      <circle cx={r} cy={r} r={30} fill={p.dark} opacity={0.35} />
      <text x={50} y={56} textAnchor="middle" fontFamily="Georgia, 'Noto Serif TC', serif" fontWeight={700} fontSize={value >= 10000 ? 22 : 24} fill={p.text}>
        {chipLabel(value)}
      </text>
    </svg>
  );
  if (flat) return <span className={`inline-block ${className}`} style={{ width: size, height: size, ...style }}>{svg}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`籌碼 ${value}`}
      aria-pressed={selected}
      className={`relative inline-flex items-center justify-center rounded-full transition-transform duration-150 disabled:opacity-40 ${
        selected ? "scale-110 drop-shadow-[0_0_10px_rgba(232,201,122,.75)]" : "hover:-translate-y-0.5 active:scale-95"
      } ${className}`}
      style={{ width: size, height: size, ...style }}
    >
      {svg}
      {selected && <span className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-gold-bright" />}
    </button>
  );
}

/** Visual stack of chips representing an amount (greedy decomposition, capped). */
export function ChipStack({ amount, chips, size = 26, max = 6 }: { amount: number; chips: readonly number[]; size?: number; max?: number }) {
  const parts: number[] = [];
  let rest = amount;
  for (const d of [...chips].sort((a, b) => b - a)) {
    while (rest >= d && parts.length < max) {
      parts.push(d);
      rest -= d;
    }
  }
  if (!parts.length) return null;
  return (
    <span className="relative inline-block" style={{ width: size, height: size + (parts.length - 1) * 4 }}>
      {parts.map((v, i) => (
        <Chip key={i} value={v} size={size} flat className="absolute left-0" style={{ bottom: i * 4 }} />
      ))}
    </span>
  );
}
