import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  ...(basePath ? { basePath } : {}),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "api.ops.team401.org" },
      { protocol: "https", hostname: "api-staging.ops.team401.org" },
      { protocol: "https", hostname: "*.workers.dev" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
  trailingSlash: true,

  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
