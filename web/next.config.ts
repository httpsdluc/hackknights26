import type { NextConfig } from "next";

// The browser only ever calls /api/* on this origin; Next proxies it to the server (CONTRACT.md §2).
const API_URL = process.env.API_URL ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  // Keep the dev badge off the projector.
  devIndicators: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/:path*` }];
  },
};

export default nextConfig;
