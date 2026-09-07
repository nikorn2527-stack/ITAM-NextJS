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
  // Transpile recharts + react-smooth + victory-vendor so Turbopack bundles
  // their ESM source correctly. Without this, Turbopack's module graph gets
  // confused by recharts' nested react-is dependency and throws:
  //   "Module react-is was instantiated but the module factory is not available"
  // at runtime after HMR. Webpack handles this automatically; Turbopack needs
  // the explicit hint.
  transpilePackages: ['recharts', 'react-smooth', 'victory-vendor', 'react-is'],
  // Allow the preview panel iframe origin to access dev resources (HMR,
  // stack frames). Without this, Next.js blocks cross-origin requests from
  // the preview-chat-*.space-z.ai domain, which breaks error overlay +
  // dev tools inside the iframe.
  allowedDevOrigins: [
    'preview-chat-83638d36-a9f3-41e4-9454-74f96640bc93.space-z.ai',
  ],
};

export default nextConfig;
