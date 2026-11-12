import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@sidera-protocol/sdk"],
};

export default nextConfig;
