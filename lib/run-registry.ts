import "server-only";
import type { AgentRun } from "agentbox-sdk";
import type { SupportedProvider } from "@/lib/sandbox-pool";

export interface RunRegistryEntry {
  run: AgentRun;
  provider: SupportedProvider;
}

type Globals = typeof globalThis & {
  __agentboxDemoRunRegistry?: Map<string, RunRegistryEntry>;
};

const g = globalThis as Globals;
g.__agentboxDemoRunRegistry ??= new Map();

const registry = g.__agentboxDemoRunRegistry!;

export function registerRun(runId: string, entry: RunRegistryEntry): void {
  registry.set(runId, entry);
}

export function unregisterRun(runId: string): void {
  registry.delete(runId);
}

export function getRun(runId: string): RunRegistryEntry | undefined {
  return registry.get(runId);
}
