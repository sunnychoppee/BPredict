"use client";

import type { RoundResult } from "@bpredict/shared";

/**
 * 珠盤路 (bead road): results flow top→bottom, then next column.
 * 6 rows × N columns, newest at the right. Red = 莊(漲) Blue = 閒(跌) Grey = 和/無效.
 */
export function BeadRoad({ results, rows = 6, cols = 12 }: { results: RoundResult[]; rows?: number; cols?: number }) {
  const capacity = rows * cols;
  const slice = results.slice(-capacity);
  const padded = [...slice, ...Array<null>(capacity - slice.length).fill(null)];

  return (
    <div className="rounded-lg border border-gold/30 bg-cream/95 p-1.5">
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoFlow: "column", gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
        {padded.map((r, i) => (
          <div key={i} className="flex aspect-square items-center justify-center">
            {r ? <Bead r={r} /> : <div className="h-full w-full rounded-full border border-black/5" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function Bead({ r }: { r: RoundResult }) {
  const cls = r.winner === "BANKER" ? "bg-banker text-white" : r.winner === "PLAYER" ? "bg-player text-white" : "bg-void text-white";
  const label = r.winner === "BANKER" ? "莊" : r.winner === "PLAYER" ? "閒" : "和";
  return (
    <div
      className={`flex h-full w-full items-center justify-center rounded-full text-[10px] font-bold leading-none shadow-sm ${cls}`}
      title={`#${r.roundNo} ${r.lockPrice ?? "-"} → ${r.closePrice ?? "-"}`}
    >
      {label}
    </div>
  );
}

/** Compact statistics for the visible history. */
export function RoadStats({ results }: { results: RoundResult[] }) {
  const b = results.filter((r) => r.winner === "BANKER").length;
  const p = results.filter((r) => r.winner === "PLAYER").length;
  const v = results.length - b - p;
  let streak = 0;
  let streakSide: RoundResult["winner"] = null;
  for (let i = results.length - 1; i >= 0; i--) {
    const w = results[i]!.winner;
    if (!w) break;
    if (!streakSide) streakSide = w;
    if (w !== streakSide) break;
    streak++;
  }
  return (
    <div className="flex items-center gap-3 text-xs text-cream/80">
      <span>
        <i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-banker align-middle" />莊 {b}
      </span>
      <span>
        <i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-player align-middle" />閒 {p}
      </span>
      <span>
        <i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-void align-middle" />和 {v}
      </span>
      {streak >= 3 && streakSide && (
        <span className="ml-auto rounded bg-gold/20 px-1.5 py-0.5 text-gold-bright">
          {streakSide === "BANKER" ? "莊" : "閒"} {streak} 連 · 長龍
        </span>
      )}
    </div>
  );
}
