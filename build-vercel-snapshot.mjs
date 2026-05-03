#!/usr/bin/env node
// Build a Vercel sandbox snapshot that mirrors sandbox-image.mjs:
// boots a bare node24 sandbox, installs the harness CLIs, calls
// sandbox.snapshot(), prints the resulting id, and tears the sandbox down.
//
// Run with:
//   node --env-file=.env build-vercel-snapshot.mjs
// then copy the printed VERCEL_SNAPSHOT_ID into .env.
//
// Vercel sandboxes are not supported by `agentbox image build` -- the CLI
// throws because Vercel has no prebuilt-image concept. Runtime snapshots
// are the supported equivalent.

import {
  Sandbox,
  SandboxProvider,
  collectAllAgentReservedPorts,
} from "agentbox-sdk";
import ms from "ms";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name} in environment. Set it in .env.`);
    process.exit(1);
  }
  return value;
}

const token = requireEnv("VERCEL_TOKEN");
const teamId = requireEnv("VERCEL_TEAM_ID");
const projectId = requireEnv("VERCEL_PROJECT_ID");

const sandbox = new Sandbox(SandboxProvider.Vercel, {
  workingDir: "/workspace",
  idleTimeoutMs: ms("45m"),
  tags: {
    app: "agentbox-demo",
    purpose: "snapshot-builder",
  },
  provider: {
    token,
    teamId,
    projectId,
    runtime: "node24",
    // Vercel's per-sandbox wall-clock lifetime. Defaults to 2min which is
    // too short for three global npm installs; give ourselves 45min.
    timeoutMs: ms("45m"),
    // Vercel requires all ports to be declared at create time (max 4, no
    // runtime openPort). Reserve every harness's app-server port so the
    // snapshot inherits a ports manifest compatible with any harness the
    // demo may later select.
    ports: collectAllAgentReservedPorts(),
  },
});

async function runStep(label, command, options = {}) {
  console.log(`\n> ${label}`);
  console.log(`  $ ${command}`);
  const started = Date.now();
  const result = await sandbox.run(command, {
    timeoutMs: options.timeoutMs ?? ms("15m"),
  });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  if (result.exitCode !== 0) {
    console.error(`  ✗ failed (${elapsed}s, exit ${result.exitCode})`);
    if (result.stdout) console.error(result.stdout);
    if (result.stderr) console.error(result.stderr);
    throw new Error(`${label} failed`);
  }
  console.log(`  ✓ ok (${elapsed}s)`);
  return result;
}

let cleanupOnExit = true;

try {
  await sandbox.findOrProvision();

  console.log("Booting Vercel sandbox (node24, this may take ~30-60s)...");
  await runStep("health check", "true", { timeoutMs: ms("5m") });

  // Install as the non-root `vercel-sandbox` user so packages land in the
  // user's npm prefix (~/.global/npm/lib/node_modules). The claude-code
  // daemon resolves `npm root -g` at runtime under this same user, so a
  // sudo/root-prefix install would leave the daemon unable to find
  // `@anthropic-ai/claude-agent-sdk`.
  await runStep(
    "install harness CLIs",
    "npm install -g pnpm @anthropic-ai/claude-code @anthropic-ai/claude-agent-sdk opencode-ai @openai/codex",
    { timeoutMs: ms("20m") },
  );

  // Sanity check the binaries are on PATH.
  await runStep(
    "verify installed binaries",
    "claude --version && opencode --version && codex --version",
    { timeoutMs: ms("2m") },
  );

  console.log("\nCapturing snapshot (this may take a minute)...");
  const snapshotId = await sandbox.snapshot();
  if (!snapshotId) {
    throw new Error("sandbox.snapshot() returned null");
  }

  // Keep the source sandbox around so Vercel finalizes the snapshot;
  // delete() still tears down the live instance afterwards.
  console.log("\n" + "=".repeat(60));
  console.log("VERCEL_SNAPSHOT_ID=" + snapshotId);
  console.log("=".repeat(60));
  console.log("\nPut the id above into .env (VERCEL_SNAPSHOT_ID=...).");
} catch (error) {
  cleanupOnExit = true;
  console.error("\nSnapshot build failed:", error?.message ?? error);
  process.exitCode = 1;
} finally {
  if (cleanupOnExit) {
    try {
      await sandbox.delete();
      console.log("Source sandbox cleaned up.");
    } catch (error) {
      console.warn(
        "Could not clean up source sandbox:",
        error?.message ?? error,
      );
    }
  }
}
