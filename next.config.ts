import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // proxy.ts (Clerk middleware) buffers the request body; default cap is 10MB.
    // Report uploads can be larger, so raise the limit.
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
