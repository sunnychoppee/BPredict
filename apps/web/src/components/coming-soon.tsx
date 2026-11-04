import type { ReactNode } from "react";
import { Card, Panel, Pill } from "@bpredict/ui";

export function ComingSoon({ title, icon, phase, blurb, items }: { title: string; icon: string; phase: string; blurb: string; items: { name: string; desc: string; extra?: ReactNode }[] }) {
  return (
    <Panel className="p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-gold">
          <span className="mr-2">{icon}</span>
          {title}
        </h1>
        <Pill tone="void">{phase} 即將開放</Pill>
      </div>
      <p className="mt-2 text-sm text-cream/70">{blurb}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {items.map((it) => (
          <Card key={it.name} className="relative overflow-hidden p-4 opacity-90">
            <div className="font-display text-lg text-gold-bright">{it.name}</div>
            <div className="mt-1 text-xs text-cream/65">{it.desc}</div>
            {it.extra}
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_30%,rgba(232,201,122,.08)_50%,transparent_70%)] bg-[length:200%_100%] animate-shimmer" />
          </Card>
        ))}
      </div>
    </Panel>
  );
}
