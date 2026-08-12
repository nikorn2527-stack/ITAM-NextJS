import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Prevent the dev server file-watcher from picking up log files and other
  // non-source files in the project root (which would cause an infinite
  // rebuild loop because every HTTP request appends to dev.log).
  watchOptions: {
    ignored: ['**/dev.log', '**/server.log', '**/*.db', '**/db/**'],
  },
};

export default nextConfig;
