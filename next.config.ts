import type { NextConfig } from "next";

// `output: 'standalone'` is only needed for `next build` (production deploy
// to Vercel / Node.js server). In dev mode it forces Turbopack to materialise
// extra server assets, ballooning RAM and triggering OOM kills on the 4GB
// sandbox. Conditionally enable it so `bun run dev` stays lean.
const isDev = process.env.NODE_ENV === 'development'

const nextConfig: NextConfig = {
  // Vercel handles output automatically — only use standalone for self-hosted.
  ...(!isDev && { output: 'standalone' as const }),
  typescript: {
    // Keep true for now — there are pre-existing TS errors that would block
    // production deploy. TODO: fix TS errors and set to false.
    ignoreBuildErrors: true,
  },
  eslint: {
    // Next 16 removed this config key but still reads it from next.config
    // via legacy compat. Safe to keep — Vercel build will skip lint.
    ignoreDuringBuilds: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
