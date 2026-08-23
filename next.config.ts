import type { NextConfig } from "next";

// `output: 'standalone'` is only needed for `next build` (production deploy
// to Vercel / Node.js server). In dev mode it forces Turbopack to materialise
// extra server assets, ballooning RAM and triggering OOM kills on the 4GB
// sandbox. Conditionally enable it so `bun run dev` stays lean.
const isDev = process.env.NODE_ENV === 'development'

const nextConfig: NextConfig = {
  ...(!isDev && { output: 'standalone' as const }),
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  reactStrictMode: false,
  // `watchOptions.ignored` is not a valid Next 16 key; Turbopack ignores it
  // and warns on every boot. Removed to silence the warning.
};

export default nextConfig;
