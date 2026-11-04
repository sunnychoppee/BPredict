"use client";

import { fmt } from "./primitives";

export interface TugOfWarProps {
  banker: number;
  player: number;
  /** Seed per side (included in the visual share so an empty table reads 50/50). */
  seed?: number;
  oddsBanker?: number;
  oddsPlayer?: number;
  className?: string;
}

/** Banker (red, left) vs Player (blue, right) pool bar. Widths animate on pool updates. */
export function TugOfWar({ banker, player, seed = 0, oddsBanker, oddsPlayer, className = "" }: TugOfWarProps) {
  const b = banker + seed;
  const p = player + seed;
  const total = b + p;
  const pct = total > 0 ? Math.round((b / total) * 100) : 50;
  return (
    <div className={`select-none ${className}`}>
      <div className="mb-1 flex items-end justify-between text-[11px]">
        <span className="text-banker">
          莊池 <b className="num text-cream">{fmt(banker)}</b>
          {oddsBanker != null && <span className="ml-1 text-cream/60">×{oddsBanker.toFixed(2)}</span>}
        </span>
        <span className="text-player">
          {oddsPlayer != null && <span className="mr-1 text-cream/60">×{oddsPlayer.toFixed(2)}</span>}
          <b className="num text-cream">{fmt(player)}</b> 閒池
        </span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full border border-gold/40 bg-felt-dark/80 shadow-inset">
        <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-banker to-[#d8434c] transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
        <div className="absolute inset-y-0 right-0 bg-gradient-to-l from-player to-[#3b6fc4] transition-[width] duration-500 ease-out" style={{ width: `${100 - pct}%` }} />
        <div className="absolute inset-y-0 w-0.5 bg-gold-bright shadow-[0_0_6px_#E8C97A] transition-[left] duration-500 ease-out" style={{ left: `calc(${pct}% - 1px)` }} />
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-cream/50">
        <span>{pct}%</span>
        <span>{100 - pct}%</span>
      </div>
    </div>
  );
}
