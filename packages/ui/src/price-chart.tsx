"use client";

import { useEffect, useRef } from "react";
import { AreaSeries, ColorType, LineStyle, createChart, type IChartApi, type IPriceLine, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { PriceTick } from "@bpredict/shared";

export interface PriceChartProps {
  /** Oldest → newest. Only the last `windowSec` seconds are shown. */
  ticks: PriceTick[];
  lockPrice?: number | null;
  /** Axis label for the lock-price line (default 鎖盤). */
  lockLabel?: string;
  height?: number;
  windowSec?: number;
  className?: string;
  /** Colour set: casino (gold / red-up / blue-down on felt) or fresh (grey / green-up / red-down on white). */
  palette?: "casino" | "fresh";
}

const PALETTES = {
  casino: {
    text: "rgba(244,232,193,.55)",
    font: "Georgia, serif",
    grid: "rgba(232,201,122,.06)",
    axis: "rgba(232,201,122,.2)",
    neutral: "#E8C97A",
    neutralFill: "rgba(232,201,122,.35)",
    up: "#e04a53",
    upFill: "rgba(179,37,45,.35)",
    down: "#4f86d8",
    downFill: "rgba(31,78,154,.4)",
    lockLine: "rgba(244,232,193,.85)",
  },
  fresh: {
    text: "rgba(107,114,128,.9)",
    font: "Inter, system-ui, sans-serif",
    grid: "rgba(17,24,39,.05)",
    axis: "rgba(17,24,39,.1)",
    neutral: "#6366F1",
    neutralFill: "rgba(99,102,241,.18)",
    up: "#16A34A",
    upFill: "rgba(22,163,74,.22)",
    down: "#EF4444",
    downFill: "rgba(239,68,68,.22)",
    lockLine: "rgba(107,114,128,.8)",
  },
} as const;

/**
 * BTC price area chart (lightweight-charts) with the lock price as a dashed baseline.
 * Line colour follows the side currently "winning" vs. the lock price.
 */
export function PriceChart({ ticks, lockPrice, lockLabel = "鎖盤", height = 120, windowSec = 600, className = "", palette = "casino" }: PriceChartProps) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Area"> | null>(null);
  const lockLine = useRef<IPriceLine | null>(null);
  const lastTs = useRef<number>(0);
  const P = PALETTES[palette];

  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      height,
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: P.text, fontFamily: P.font, fontSize: 10, attributionLogo: false },
      grid: { vertLines: { color: P.grid }, horzLines: { color: P.grid } },
      rightPriceScale: { borderColor: P.axis, scaleMargins: { top: 0.15, bottom: 0.1 } },
      timeScale: { borderColor: P.axis, timeVisible: true, secondsVisible: false, rightOffset: 2 },
      handleScroll: false,
      handleScale: false,
      crosshair: { horzLine: { visible: false, labelVisible: false }, vertLine: { visible: false, labelVisible: false } },
    });
    const s = c.addSeries(AreaSeries, {
      lineColor: P.neutral,
      topColor: P.neutralFill,
      bottomColor: "rgba(0,0,0,0)",
      lineWidth: 2,
      priceLineVisible: true,
      priceLineColor: P.neutral,
      lastValueVisible: true,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });
    chart.current = c;
    series.current = s;
    lastTs.current = 0;
    return () => {
      c.remove();
      chart.current = null;
      series.current = null;
      lockLine.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, palette]);

  // Full reload when the tick array identity changes substantially; incremental update otherwise.
  useEffect(() => {
    const s = series.current;
    if (!s) return;
    const cutoff = Date.now() - windowSec * 1000;
    const pts: { time: UTCTimestamp; value: number }[] = [];
    let prev = 0;
    for (const t of ticks) {
      if (t.ts < cutoff) continue;
      const sec = Math.floor(t.ts / 1000);
      if (sec <= prev) continue; // strictly ascending unique timestamps
      prev = sec;
      pts.push({ time: sec as UTCTimestamp, value: t.price });
    }
    if (!pts.length) return;
    const last = pts[pts.length - 1]!;
    if (lastTs.current && pts.length > 1 && Number(pts[0]!.time) <= lastTs.current && Number(last.time) >= lastTs.current) {
      // incremental: append any points newer than what we have
      for (const p of pts) if (Number(p.time) > lastTs.current) s.update(p);
    } else {
      s.setData(pts);
      chart.current?.timeScale().fitContent();
    }
    lastTs.current = Number(last.time);

    const lp = lockPrice ?? null;
    const up = lp != null ? last.value > lp : null;
    s.applyOptions({
      lineColor: up == null ? P.neutral : up ? P.up : P.down,
      topColor: up == null ? P.neutralFill : up ? P.upFill : P.downFill,
    });
  }, [ticks, windowSec, lockPrice, P]);

  useEffect(() => {
    const s = series.current;
    if (!s) return;
    if (lockLine.current) {
      s.removePriceLine(lockLine.current);
      lockLine.current = null;
    }
    if (lockPrice != null) {
      lockLine.current = s.createPriceLine({ price: lockPrice, color: P.lockLine, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: lockLabel });
    }
  }, [lockPrice, lockLabel, P]);

  return <div ref={el} className={`w-full ${className}`} style={{ height }} />;
}
