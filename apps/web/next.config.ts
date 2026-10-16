import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Self-contained server build (.next/standalone) so the Docker image ships
  // only the compiled server + static assets, not the full node_modules.
  output: 'standalone',
};

export default nextConfig;
