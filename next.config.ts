import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  reactStrictMode: false,
  watchOptions: {
    ignored: ['**/dev.log', '**/server.log', '**/*.db', '**/db/**'],
  },
  // Allow the sandbox preview host to access the Next.js dev server.
  // Without this, dev resources (/_next/static/chunks/*) are blocked
  // cross-origin by Next 16's default allowlist.
  allowedDevOrigins: [
    'preview-chat-3bdea8cb-d2cc-4477-b1fa-fbf49c70da2a.space-z.ai',
    '.space-z.ai',
    'localhost',
    '127.0.0.1',
  ],
};

export default nextConfig;
