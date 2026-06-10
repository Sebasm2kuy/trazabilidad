import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/trazabilidad",
  images: { unoptimized: true },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;