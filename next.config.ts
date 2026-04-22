import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "agentbox-sdk",
    "@daytonaio/sdk",
    "@vercel/sandbox",
    "dockerode",
    "e2b",
    "modal",
    "tar-stream",
    "ws",
  ],
};

export default nextConfig;
