import type { Config } from "tailwindcss";

// Token values mirror packages/shared/src/colors.ts and TECH_DESIGN.md §3.2.1.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
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
    },
  },
  plugins: [],
};

export default config;
