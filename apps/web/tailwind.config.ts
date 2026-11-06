import type { Config } from "tailwindcss";

// Token values live in globals.css as RGB triplets (`--c-*`) so the same utility classes re-theme
// under `html[data-mode="fresh"]`. Casino defaults mirror packages/shared/src/colors.ts and TECH_DESIGN.md §3.2.1.
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        felt: { DEFAULT: v("felt"), dark: v("felt-dark") },
        gold: { DEFAULT: v("gold"), bright: v("gold-bright") },
        banker: v("banker"),
        player: v("player"),
        cream: v("cream"),
        void: v("void"),
        /** Positive / negative money deltas (not side colours — see me / history pages). */
        pos: v("pos"),
        neg: v("neg"),
      },
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-sans)"],
      },
      boxShadow: {
        gold: "0 0 0 1px rgb(var(--c-gold)), 0 0 24px rgb(var(--c-glow) / .25)",
        glow: "0 0 24px rgb(var(--c-glow) / .35)",
        inset: "inset 0 2px 12px rgba(0,0,0,.45)",
      },
      backgroundImage: {
        vignette: "var(--vignette)",
      },
      keyframes: {
        fadein: { from: { opacity: "0", transform: "translateY(-6px)" }, to: { opacity: "1", transform: "none" } },
        winglow: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgb(var(--c-glow) / 0)" },
          "50%": { boxShadow: "0 0 28px 6px rgb(var(--c-glow) / .55)" },
        },
        shimmer: { from: { backgroundPosition: "-200% 0" }, to: { backgroundPosition: "200% 0" } },
      },
      animation: { fadein: "fadein .25s ease-out", winglow: "winglow 1s ease-in-out 3", shimmer: "shimmer 2.5s linear infinite" },
    },
  },
  plugins: [],
};

export default config;
