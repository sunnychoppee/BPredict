"use client";

import { useState } from "react";
import type { RoundResult } from "@bpredict/shared";
import { BeadRoad, BigRoad, RoadStats, fmtPx } from "@bpredict/ui";

/** 路紙：大路 / 珠盤 切換 + 統計 + 最近開獎。Mobile 可收合；PC 右欄常駐全部展開。 */
export function RoadPanel({ results, variant }: { results: RoundResult[]; variant: "mobile" | "desktop" }) {
  const [mode, setMode] = useState<"big" | "bead">("big");
  const [open, setOpen] = useState(true);

  if (variant === "desktop") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="font-display text-base text-gold">路紙</span>
          <span className="text-xs text-cream/60">近 {Math.min(results.length, 108)} 局</span>
        </div>
        <div className="text-[11px] text-cream/60">大路</div>
        <BigRoad results={results} cols={22} />
        <div className="text-[11px] text-cream/60">珠盤路</div>
        <BeadRoad results={results} cols={18} />
        <RoadStats results={results.slice(-108)} />
        <RecentList results={results} n={14} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gold/30 bg-felt-dark/60">
      <div className="flex items-center justify-between px-3 py-2">
        <button className="flex items-center gap-2 text-sm text-gold" onClick={() => setOpen((o) => !o)}>
          <span className="font-display">路紙</span>
          <span className="text-[10px] text-cream/50">{open ? "▲" : "▼"}</span>
        </button>
        <div className="flex gap-1 rounded-md border border-gold/30 p-0.5 text-[11px]">
          {(["big", "bead"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded px-2 py-0.5 ${mode === m ? "bg-gold text-felt-dark" : "text-cream/70"}`}>
              {m === "big" ? "大路" : "珠盤"}
            </button>
          ))}
        </div>
      </div>
      {open && (
        <div className="space-y-2 px-3 pb-3">
          {mode === "big" ? <BigRoad results={results} cols={16} /> : <BeadRoad results={results} cols={12} />}
          <RoadStats results={results.slice(-72)} />
        </div>
      )}
    </div>
  );
}

function RecentList({ results, n }: { results: RoundResult[]; n: number }) {
  return (
    <ul className="max-h-56 space-y-1 overflow-y-auto text-[11px] text-cream/60">
      {[...results].reverse().slice(0, n).map((r) => (
        <li key={r.roundNo} className="flex justify-between">
          <span>#{r.roundNo}</span>
          <span className="num">
            {fmtPx(r.lockPrice)} → {fmtPx(r.closePrice)}
          </span>
          <span className={r.winner === "BANKER" ? "text-banker" : r.winner === "PLAYER" ? "text-player" : "text-void"}>{r.winner === "BANKER" ? "莊" : r.winner === "PLAYER" ? "閒" : "和"}</span>
        </li>
      ))}
    </ul>
  );
}
