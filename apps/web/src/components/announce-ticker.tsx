"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useTable } from "@/lib/table-store";

/** Horizontal marquee of recent table announcements (big bets, streaks, dragons, leader changes). */
export function AnnounceTicker() {
  const items = useTable((s) => s.announcements);
  const latest = items[items.length - 1];
  if (!latest) return null;
  const icon = latest.kind === "big_bet" ? "💰" : latest.kind === "dragon" ? "🐉" : latest.kind === "leader" ? "👑" : "🔥";
  return (
    <div className="mb-2 flex h-7 items-center gap-2 overflow-hidden rounded-md border border-gold/25 bg-felt-dark/70 px-2 text-xs">
      <span className="shrink-0">{icon}</span>
      <div className="relative h-full flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div key={latest.id} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} transition={{ duration: 0.25 }} className="absolute inset-0 flex items-center">
            <span className="truncate text-gold-bright/90">{latest.text.replace(/^\S+\s/, "")}</span>
          </motion.div>
        </AnimatePresence>
      </div>
      {items.length > 1 && <span className="shrink-0 text-[10px] text-cream/40">{items.length}</span>}
    </div>
  );
}
