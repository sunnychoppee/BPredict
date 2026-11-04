"use client";

import dynamic from "next/dynamic";

/** lightweight-charts touches `window`; load it client-side only. */
export const PriceChartClient = dynamic(() => import("@bpredict/ui").then((m) => m.PriceChart), {
  ssr: false,
  loading: () => <div className="h-[120px] w-full animate-pulse rounded-md bg-felt-dark/40" />,
});
