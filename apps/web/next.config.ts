import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@bpredict/shared", "@bpredict/ui"],
  // Standalone output needs symlink rights (fails on Windows without dev mode); Railway runs `next start` directly.
  ...(process.env.NEXT_STANDALONE === "1" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
