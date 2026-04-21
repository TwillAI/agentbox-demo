import "server-only";
import {
  Sandbox,
  type SandboxOptions,
  type SandboxProviderName,
} from "agentbox-sdk";
import ms from "ms";

type SupportedProvider = "e2b" | "modal" | "daytona";

interface PoolEntry {
  sandbox: Sandbox;
  createdAt: number;
}

type Globals = typeof globalThis & {
  __agentboxDemoSandboxPool?: Map<SupportedProvider, PoolEntry>;
  __agentboxDemoPending?: Map<SupportedProvider, Promise<Sandbox>>;
  __agentboxDemoBusy?: Map<SupportedProvider, boolean>;
};

const g = globalThis as Globals;
g.__agentboxDemoSandboxPool ??= new Map();
g.__agentboxDemoPending ??= new Map();
g.__agentboxDemoBusy ??= new Map();

const pool = g.__agentboxDemoSandboxPool!;
const pending = g.__agentboxDemoPending!;
const busy = g.__agentboxDemoBusy!;

function imageFor(provider: SupportedProvider): string {
  switch (provider) {
    case "e2b": {
      const v = process.env.E2B_TEMPLATE_ID;
      if (!v) {
        throw new Error(
          "E2B_TEMPLATE_ID is not set. Build the demo sandbox image for e2b first (see README).",
        );
      }
      return v;
    }
    case "modal": {
      const v = process.env.MODAL_IMAGE_ID ?? process.env.OPENAGENT_MODAL_IMAGE;
      if (!v) {
        throw new Error(
          "MODAL_IMAGE_ID is not set. Build the demo sandbox image for modal first (see README).",
        );
      }
      return v;
    }
    case "daytona": {
      const v = process.env.DAYTONA_SNAPSHOT_ID;
      if (!v) {
        throw new Error(
          "DAYTONA_SNAPSHOT_ID is not set. Build the demo sandbox image for daytona first (see README).",
        );
      }
      return v;
    }
  }
}

export function agentEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (process.env.ANTHROPIC_API_KEY) {
    env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  }
  if (process.env.OPENAI_API_KEY) {
    env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  }
  return env;
}

function buildOptions<P extends SupportedProvider>(
  provider: P,
): SandboxOptions<P> {
  const base = {
    workingDir: "/workspace",
    image: imageFor(provider),
    env: agentEnv(),
    idleTimeoutMs: ms("1h"),
    tags: { app: "agentbox-demo" },
  };

  if (provider === "modal") {
    return {
      ...base,
      provider: {
        appName: process.env.MODAL_APP_NAME,
        tokenId: process.env.MODAL_TOKEN_ID,
        tokenSecret: process.env.MODAL_TOKEN_SECRET,
      },
    } as SandboxOptions<P>;
  }

  if (provider === "e2b") {
    return {
      ...base,
      provider: { apiKey: process.env.E2B_API_KEY },
    } as SandboxOptions<P>;
  }

  if (provider === "daytona") {
    return {
      ...base,
      provider: { apiKey: process.env.DAYTONA_API_KEY },
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

export function tryAcquireSlot(provider: SupportedProvider): boolean {
  if (busy.get(provider)) return false;
  busy.set(provider, true);
  return true;
}

export function releaseSlot(provider: SupportedProvider): void {
  busy.set(provider, false);
}

export function isBusy(provider: SupportedProvider): boolean {
  return !!busy.get(provider);
}

export type { SupportedProvider };
