import type { SVGProps } from "react";

/** Line icons for the 簡約漲跌 chrome (casino keeps emoji). 24×24, stroke = currentColor. */
const base = (props: SVGProps<SVGSVGElement>) => ({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, width: 22, height: 22, ...props });

export const IconMarket = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M14 7h7v7" />
  </svg>
);
export const IconGift = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3" y="8" width="18" height="13" rx="2" />
    <path d="M12 8v13M3 12h18" />
    <path d="M12 8c-2-3-6-3-6 0 0 2 3 2 6 0 3 2 6 2 6 0 0-3-4-3-6 0z" />
  </svg>
);
export const IconCart = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6 6h15l-1.5 9h-12z" />
    <circle cx="9" cy="20" r="1" />
    <circle cx="18" cy="20" r="1" />
    <path d="M6 6L5 3H2" />
  </svg>
);
export const IconTrophy = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0z" />
    <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
  </svg>
);
export const IconUser = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);
export const IconSound = ({ muted, ...p }: SVGProps<SVGSVGElement> & { muted?: boolean }) => (
  <svg {...base(p)}>
    <path d="M4 10v4h4l5 4V6L8 10z" />
    {muted ? <path d="M17 9l4 6M21 9l-4 6" /> : <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />}
  </svg>
);
export const IconCoin = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="#F59E0B" stroke="#B45309" strokeWidth={1.5}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" fill="#FBBF24" />
  </svg>
);
export const IconGem = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="#60A5FA" stroke="#1D4ED8" strokeWidth={1.5}>
    <path d="M7 3h10l4 6-9 12L3 9z" />
    <path d="M3 9h18M7 3l5 18M17 3l-5 18" fill="none" />
  </svg>
);
