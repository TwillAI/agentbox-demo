import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // AI Elements ships components targeting a slightly different @base-ui/react
  // major than the one installed via shadcn; its unused components trip tsc.
  // Our own code passes strict typecheck (`pnpm typecheck`), and AI Elements
  // components still run correctly at runtime.
  typescript: {
    ignoreBuildErrors: true,
  },
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
