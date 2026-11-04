"use client";

import { mmss } from "./primitives";

export interface CountdownRingProps {
  /** Seconds remaining. */
  secs: number;
  /** Total seconds of this phase (for the arc). */
  total: number;
  size?: number;
  label?: string;
  tone?: "gold" | "banker" | "player" | "void";
  urgentAt?: number;
}

/** SVG ring that drains clockwise; turns red and pulses in the last `urgentAt` seconds. */
export function CountdownRing({ secs, total, size = 84, label, tone = "gold", urgentAt = 10 }: CountdownRingProps) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.min(1, Math.max(0, secs / total)) : 0;
  const urgent = secs > 0 && secs <= urgentAt;
  const color = urgent ? "#B3252D" : tone === "banker" ? "#B3252D" : tone === "player" ? "#1F4E9A" : tone === "void" ? "#8A8A8A" : "#E8C97A";
  return (
    <div className={`relative inline-flex items-center justify-center ${urgent ? "animate-pulse" : ""}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="rgba(7,31,24,.6)" stroke="rgba(232,201,122,.18)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: "stroke-dashoffset .9s linear, stroke .3s" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="num text-xl text-cream" style={{ color: urgent ? "#E8C97A" : undefined }}>
          {mmss(secs)}
        </span>
        {label && <span className="mt-1 text-[9px] tracking-widest text-cream/60">{label}</span>}
      </div>
    </div>
  );
}
