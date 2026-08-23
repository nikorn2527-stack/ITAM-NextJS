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
};

export default nextConfig;
