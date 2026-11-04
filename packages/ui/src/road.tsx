"use client";

import { useMemo } from "react";
import type { RoundResult } from "@bpredict/shared";

const ROWS = 6;

// ------------------------------------------------------------------ 大路 (Big Road)

export interface BigRoadCell {
  col: number;
  row: number;
  winner: "BANKER" | "PLAYER";
  ties: number; // ties (void rounds) recorded after this result
  roundNo: number;
}

/**
 * Standard baccarat big road: a new column per change of winner; consecutive wins go down a column;
 * when blocked at the bottom (or by a previous "dragon tail") the streak turns right along the row.
 * Void rounds (winner null) are drawn as tie marks on the previous cell.
 */
export function buildBigRoad(results: RoundResult[], rows = ROWS): { cells: BigRoadCell[]; cols: number } {
  const cells: BigRoadCell[] = [];
  const occupied = new Set<string>();
  const key = (c: number, r: number) => `${c}:${r}`;
  let last: BigRoadCell | null = null;
  let streakStartCol = -1;
  let maxCol = -1;
  let leadingTies = 0;

  for (const r of results) {
    if (!r.winner) {
      if (last) last.ties++;
      else leadingTies++;
      continue;
    }
    let col: number;
    let row: number;
    if (last && last.winner === r.winner) {
      if (last.row + 1 < rows && !occupied.has(key(last.col, last.row + 1))) {
        col = last.col;
        row = last.row + 1;
      } else {
        col = last.col + 1;
        row = last.row;
        while (occupied.has(key(col, row))) col++;
      }
    } else {
      col = Math.max(maxCol, streakStartCol) + 1;
      row = 0;
      while (occupied.has(key(col, row))) col++;
      streakStartCol = col;
    }
    const cell: BigRoadCell = { col, row, winner: r.winner, ties: last ? 0 : leadingTies, roundNo: r.roundNo };
    leadingTies = 0;
    occupied.add(key(col, row));
    maxCol = Math.max(maxCol, col);
    cells.push(cell);
    last = cell;
  }
  return { cells, cols: maxCol + 1 };
}

export function BigRoad({ results, cols = 18, rows = ROWS, className = "" }: { results: RoundResult[]; cols?: number; rows?: number; className?: string }) {
  const road = useMemo(() => buildBigRoad(results, rows), [results, rows]);
  const offset = Math.max(0, road.cols - cols); // show the newest `cols` columns
  const visible = road.cells.filter((c) => c.col >= offset);
  return (
    <div className={`relative rounded-lg border border-gold/30 bg-cream/95 p-1.5 ${className}`}>
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
        {Array.from({ length: rows * cols }, (_, i) => (
          <div key={i} className="aspect-square rounded-full border border-black/[.06]" />
        ))}
      </div>
      <div className="absolute inset-1.5 grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
        {visible.map((c) => (
          <div key={`${c.col}:${c.row}`} className="relative flex items-center justify-center" style={{ gridColumn: c.col - offset + 1, gridRow: c.row + 1 }} title={`#${c.roundNo}`}>
            <span className={`block h-[78%] w-[78%] rounded-full border-[3px] ${c.winner === "BANKER" ? "border-banker" : "border-player"}`} />
            {c.ties > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-emerald-600 px-0.5 text-[8px] font-bold leading-none text-white">
                {c.ties > 1 ? c.ties : ""}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ 珠盤路 (Bead Road)

export function BeadRoad({ results, rows = ROWS, cols = 12, className = "" }: { results: RoundResult[]; rows?: number; cols?: number; className?: string }) {
  const capacity = rows * cols;
  const slice = results.slice(-capacity);
  const padded = [...slice, ...Array<null>(capacity - slice.length).fill(null)];
  return (
    <div className={`rounded-lg border border-gold/30 bg-cream/95 p-1.5 ${className}`}>
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
    <div className={`flex h-full w-full items-center justify-center rounded-full text-[10px] font-bold leading-none shadow-sm ${cls}`} title={`#${r.roundNo} ${r.lockPrice ?? "-"} → ${r.closePrice ?? "-"}`}>
      {label}
    </div>
  );
}

// ------------------------------------------------------------------ 統計

export function roadStats(results: RoundResult[]) {
  const b = results.filter((r) => r.winner === "BANKER").length;
  const p = results.filter((r) => r.winner === "PLAYER").length;
  const v = results.length - b - p;
  let streak = 0;
  let streakSide: RoundResult["winner"] = null;
  for (let i = results.length - 1; i >= 0; i--) {
    const w = results[i]!.winner;
    if (!w) continue; // ties don't break a streak on the road
    if (!streakSide) streakSide = w;
    if (w !== streakSide) break;
    streak++;
  }
  return { b, p, v, streak, streakSide };
}

export interface RoadLabels {
  banker: string;
  player: string;
  tie: string;
  /** e.g. "{side} {n} 連 · 長龍" — receives the side label and run length. */
  dragon: (side: string, n: number) => string;
}
export const ROAD_LABELS_ZH: RoadLabels = { banker: "莊", player: "閒", tie: "和", dragon: (side, n) => `${side} ${n} 連 · 長龍` };

export function RoadStats({ results, className = "", labels = ROAD_LABELS_ZH }: { results: RoundResult[]; className?: string; labels?: RoadLabels }) {
  const s = roadStats(results);
  return (
    <div className={`flex items-center gap-3 text-xs text-cream/80 ${className}`}>
      <span>
        <i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-banker align-middle" />
        {labels.banker} {s.b}
      </span>
      <span>
        <i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-player align-middle" />
        {labels.player} {s.p}
      </span>
      <span>
        <i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-void align-middle" />
        {labels.tie} {s.v}
      </span>
      {s.streak >= 3 && s.streakSide && <span className="ml-auto rounded bg-gold/20 px-1.5 py-0.5 text-gold-bright">{labels.dragon(s.streakSide === "BANKER" ? labels.banker : labels.player, s.streak)}</span>}
    </div>
  );
}
