import "server-only";
import {
  AgentProvider,
  Sandbox,
  SandboxProvider,
  collectAllAgentReservedPorts,
  type AgentProviderName,
  type SandboxOptions,
  type SandboxProviderName,
} from "agentbox-sdk";
import ms from "ms";

type SupportedProvider = Exclude<SandboxProviderName, "local-docker">;

interface PoolEntry {
  sandbox: Sandbox;
  createdAt: number;
}

type Globals = typeof globalThis & {
  __agentboxDemoSandboxPool?: Map<SupportedProvider, PoolEntry>;
  __agentboxDemoPending?: Map<SupportedProvider, Promise<Sandbox>>;
};

const g = globalThis as Globals;
g.__agentboxDemoSandboxPool ??= new Map();
g.__agentboxDemoPending ??= new Map();

const pool = g.__agentboxDemoSandboxPool!;
const pending = g.__agentboxDemoPending!;

function imageFor(provider: SupportedProvider): string {
  switch (provider) {
    case SandboxProvider.E2B: {
      const v = process.env.E2B_TEMPLATE_ID;
      if (!v) {
        throw new Error(
          "E2B_TEMPLATE_ID is not set. Build the demo sandbox image for e2b first (see README).",
        );
      }
      return v;
    }
    case SandboxProvider.Modal: {
      const v = process.env.MODAL_IMAGE_ID ?? process.env.OPENAGENT_MODAL_IMAGE;
      if (!v) {
        throw new Error(
          "MODAL_IMAGE_ID is not set. Build the demo sandbox image for modal first (see README).",
        );
      }
      return v;
    }
    case SandboxProvider.Daytona: {
      const v = process.env.DAYTONA_SNAPSHOT_ID;
      if (!v) {
        throw new Error(
          "DAYTONA_SNAPSHOT_ID is not set. Build the demo sandbox image for daytona first (see README).",
        );
      }
      return v;
    }
    case SandboxProvider.Vercel: {
      // Vercel ignores SandboxOptionsBase.image — provisioning uses
      // provider.snapshotId instead. Snapshot gating happens in buildOptions
      // and in /api/config. This branch exists only for exhaustiveness.
      throw new Error(
        "imageFor() should not be called for the vercel provider — use provider.snapshotId instead.",
      );
    }
  }
}

export function agentEnv(harness?: AgentProviderName): Record<string, string> {
  const env: Record<string, string> = {};
  if (process.env.ANTHROPIC_API_KEY) {
    env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  }
  if (process.env.OPENAI_API_KEY) {
    env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  }
  const proxyUrl = process.env.LLM_PROXY_URL?.replace(/\/+$/, "");
  if (proxyUrl) {
    // opencode expects the Anthropic base URL to point at a root that hosts
    // `/v1/messages` directly, so the proxy must be exposed as `${proxy}/v1`.
    // Other harnesses (claude-code, codex) use our `/anthropic` passthrough.
    env.ANTHROPIC_BASE_URL =
      harness === AgentProvider.OpenCode
        ? `${proxyUrl}/v1`
        : `${proxyUrl}/anthropic`;
    env.OPENAI_BASE_URL = proxyUrl;
  }
  return env;
}

function buildOptions<P extends SupportedProvider>(
  provider: P,
): SandboxOptions<P> {
  // `image` intentionally omitted here — the Vercel adapter ignores
  // `SandboxOptionsBase.image` and provisions from `provider.snapshotId`
  // instead. Providers that do use images add it in their branch below.
  const base = {
    workingDir: "/workspace",
    env: agentEnv(),
    idleTimeoutMs: ms("1h"),
    tags: { app: "agentbox-demo" },
  };

  if (provider === SandboxProvider.Modal) {
    return {
      ...base,
      image: imageFor(provider),
      provider: {
        appName: process.env.MODAL_APP_NAME,
        tokenId: process.env.MODAL_TOKEN_ID,
        tokenSecret: process.env.MODAL_TOKEN_SECRET,
      },
    } as SandboxOptions<P>;
  }

  if (provider === SandboxProvider.E2B) {
    return {
      ...base,
      image: imageFor(provider),
      provider: { apiKey: process.env.E2B_API_KEY },
    } as SandboxOptions<P>;
  }

  if (provider === SandboxProvider.Daytona) {
    return {
      ...base,
      image: imageFor(provider),
      provider: { apiKey: process.env.DAYTONA_API_KEY },
    } as SandboxOptions<P>;
  }

  if (provider === SandboxProvider.Vercel) {
    return {
      ...base,
      provider: {
        token: process.env.VERCEL_TOKEN,
        teamId: process.env.VERCEL_TEAM_ID,
        projectId: process.env.VERCEL_PROJECT_ID,
        snapshotId: process.env.VERCEL_SNAPSHOT_ID,
        // Vercel requires ports at create time (no runtime openPort);
        // pre-declare every harness's reserved port so switching harnesses
        // on the same warm sandbox never loses reachability.
        ports: collectAllAgentReservedPorts(),
        ...(process.env.VERCEL_PROTECTION_BYPASS
          ? { protectionBypass: process.env.VERCEL_PROTECTION_BYPASS }
          : {}),
      },
    } as SandboxOptions<P>;
  }

  return base as SandboxOptions<P>;
}

async function isSandboxHealthy(sandbox: Sandbox): Promise<boolean> {
  try {
    const result = await sandbox.run(["true"], { timeoutMs: 10_000 });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function getSandbox(
  provider: SupportedProvider,
): Promise<Sandbox> {
  const existing = pool.get(provider);
  if (existing && (await isSandboxHealthy(existing.sandbox))) {
    return existing.sandbox;
  }

  if (existing) {
    pool.delete(provider);
    existing.sandbox.delete().catch(() => undefined);
  }

  const inFlight = pending.get(provider);
  if (inFlight) {
    return inFlight;
  }

  const boot = (async () => {
    const options = buildOptions(provider);
    const sandbox = new Sandbox(
      provider as SandboxProviderName,
      options as SandboxOptions,
    );
    await sandbox.run(["true"], { timeoutMs: 120_000 });
    pool.set(provider, { sandbox, createdAt: Date.now() });
    return sandbox;
  })();

  pending.set(provider, boot);
  try {
    return await boot;
  } finally {
    pending.delete(provider);
  }
}

export type { SupportedProvider };
