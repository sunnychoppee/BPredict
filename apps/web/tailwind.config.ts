import type { Config } from "tailwindcss";

// Token values mirror packages/shared/src/colors.ts and TECH_DESIGN.md §3.2.1.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        felt: { DEFAULT: "#0B3D2E", dark: "#071F18" },
        gold: { DEFAULT: "#C9A24D", bright: "#E8C97A" },
        banker: "#B3252D",
        player: "#1F4E9A",
        cream: "#F4E8C1",
        void: "#8A8A8A",
      },
      fontFamily: {
        display: ["Georgia", "'Noto Serif TC'", "serif"],
        sans: ["system-ui", "'Noto Sans TC'", "sans-serif"],
      },
      boxShadow: {
        gold: "0 0 0 1px #C9A24D, 0 0 24px rgba(201,162,77,.25)",
        inset: "inset 0 2px 12px rgba(0,0,0,.45)",
      },
      backgroundImage: {
        vignette: "radial-gradient(ellipse at center, rgba(232,201,122,.10) 0%, rgba(0,0,0,0) 55%, rgba(0,0,0,.45) 100%)",
      },
      keyframes: {
        fadein: { from: { opacity: "0", transform: "translateY(-6px)" }, to: { opacity: "1", transform: "none" } },
        winglow: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(232,201,122,0)" },
          "50%": { boxShadow: "0 0 28px 6px rgba(232,201,122,.55)" },
        },
        shimmer: { from: { backgroundPosition: "-200% 0" }, to: { backgroundPosition: "200% 0" } },
      },
      animation: { fadein: "fadein .25s ease-out", winglow: "winglow 1s ease-in-out 3", shimmer: "shimmer 2.5s linear infinite" },
    },
  },
  plugins: [],
};

export default config;
