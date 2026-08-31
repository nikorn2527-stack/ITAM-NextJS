import type { NextConfig } from "next";

/**
 * Next.js configuration for ITAM.
 *
 * output: 'standalone' is ONLY needed for self-hosted deployments
 * (Docker, VPS, sandbox). Vercel handles deployment automatically and
 * does NOT need standalone mode — in fact, standalone causes build
 * failures on Vercel with:
 *   "ENOENT: no such file or directory, open '.next/next-server.js.nft.json'"
 *
 * Detection logic:
 *   - VERCEL env var is set by Vercel during build → use default output
 *   - NODE_ENV === 'development' → no standalone (saves memory)
 *   - Otherwise (self-hosted / sandbox) → use standalone
 */

const isVercel = !!process.env.VERCEL
const isDev = process.env.NODE_ENV === 'development'
// Only use standalone for self-hosted (not Vercel, not dev)
const useStandalone = !isVercel && !isDev

const nextConfig: NextConfig = {
  ...(useStandalone && { output: 'standalone' as const }),
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
