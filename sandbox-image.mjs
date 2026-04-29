export default {
  name: "agentbox-demo",
  base: "node:20-bookworm",
  env: {
    DEBIAN_FRONTEND: "noninteractive",
  },
  run: [
    "apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git python3 unzip && rm -rf /var/lib/apt/lists/*",
    "npm cache clean --force",
    "npm install -g pnpm @anthropic-ai/claude-code @anthropic-ai/claude-agent-sdk opencode-ai @openai/codex",
  ],
  workdir: "/workspace",
  cmd: ["sleep", "infinity"],
  resources: {
    cpu: 1,
    memoryMiB: 2048,
  },
};
