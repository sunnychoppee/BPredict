"use client";

import { CasinoTable } from "@/components/casino-table";
import { MarketTable } from "@/components/market-table";
import { useUiMode } from "@/lib/ui-mode";

/** Picks the table skin for the active UI mode; both share `useTableController`. */
export function Table() {
  const mode = useUiMode((s) => s.mode);
  return mode === "fresh" ? <MarketTable /> : <CasinoTable />;
}
