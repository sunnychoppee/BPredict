"use client";

import { useEffect, useRef } from "react";
import { AreaSeries, ColorType, LineStyle, createChart, type IChartApi, type IPriceLine, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { PriceTick } from "@bpredict/shared";

export interface PriceChartProps {
  /** Oldest → newest. Only the last `windowSec` seconds are shown. */
  ticks: PriceTick[];
  lockPrice?: number | null;
  height?: number;
  windowSec?: number;
  className?: string;
}

/**
 * BTC price area chart (lightweight-charts) with the lock price as a dashed baseline.
 * Line colour follows the side currently "winning" vs. the lock price.
 */
export function PriceChart({ ticks, lockPrice, height = 120, windowSec = 600, className = "" }: PriceChartProps) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Area"> | null>(null);
  const lockLine = useRef<IPriceLine | null>(null);
  const lastTs = useRef<number>(0);

  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      height,
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "rgba(244,232,193,.55)", fontFamily: "Georgia, serif", fontSize: 10, attributionLogo: false },
      grid: { vertLines: { color: "rgba(232,201,122,.06)" }, horzLines: { color: "rgba(232,201,122,.06)" } },
      rightPriceScale: { borderColor: "rgba(232,201,122,.2)", scaleMargins: { top: 0.15, bottom: 0.1 } },
      timeScale: { borderColor: "rgba(232,201,122,.2)", timeVisible: true, secondsVisible: false, rightOffset: 2 },
      handleScroll: false,
      handleScale: false,
      crosshair: { horzLine: { visible: false, labelVisible: false }, vertLine: { visible: false, labelVisible: false } },
    });
    const s = c.addSeries(AreaSeries, {
      lineColor: "#E8C97A",
      topColor: "rgba(232,201,122,.35)",
      bottomColor: "rgba(232,201,122,0)",
      lineWidth: 2,
      priceLineVisible: true,
      priceLineColor: "rgba(232,201,122,.5)",
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
  }, [height]);

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
      lineColor: up == null ? "#E8C97A" : up ? "#e04a53" : "#4f86d8",
      topColor: up == null ? "rgba(232,201,122,.35)" : up ? "rgba(179,37,45,.35)" : "rgba(31,78,154,.4)",
    });
  }, [ticks, windowSec, lockPrice]);

  useEffect(() => {
    const s = series.current;
    if (!s) return;
    if (lockLine.current) {
      s.removePriceLine(lockLine.current);
      lockLine.current = null;
    }
    if (lockPrice != null) {
      lockLine.current = s.createPriceLine({ price: lockPrice, color: "rgba(244,232,193,.85)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "鎖盤" });
    }
  }, [lockPrice]);

  return <div ref={el} className={`w-full ${className}`} style={{ height }} />;
}
