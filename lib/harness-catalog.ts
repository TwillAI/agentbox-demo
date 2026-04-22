import { AgentProvider, SandboxProvider } from "agentbox-sdk/enums";
import type { AgentProviderName, SandboxProviderName } from "agentbox-sdk";

export type HarnessName = AgentProviderName;

export const HARNESSES: HarnessName[] = [
  AgentProvider.ClaudeCode,
  AgentProvider.OpenCode,
  AgentProvider.Codex,
];

export const HARNESS_LABELS: Record<HarnessName, string> = {
  [AgentProvider.ClaudeCode]: "Claude Code",
  [AgentProvider.OpenCode]: "OpenCode",
  [AgentProvider.Codex]: "Codex",
};

export const HARNESS_MODELS: Record<HarnessName, string[]> = {
  [AgentProvider.ClaudeCode]: ["sonnet", "opus", "haiku"],
  [AgentProvider.OpenCode]: [
    "anthropic/claude-sonnet-4-6",
    "anthropic/claude-opus-4-7",
    "openai/gpt-5.4",
  ],
  [AgentProvider.Codex]: ["gpt-5.4"],
};

export const SUPPORTED_SANDBOXES: SandboxProviderName[] = [
  SandboxProvider.E2B,
  SandboxProvider.Modal,
  SandboxProvider.Daytona,
  SandboxProvider.Vercel,
];

export const SANDBOX_LABELS: Record<string, string> = {
  [SandboxProvider.E2B]: "E2B",
  [SandboxProvider.Modal]: "Modal",
  [SandboxProvider.Daytona]: "Daytona",
  [SandboxProvider.Vercel]: "Vercel",
};

export function defaultModelFor(harness: HarnessName): string {
  return HARNESS_MODELS[harness][0];
}

/**
 * Maps (harness, model) to a provider slug understood by
 * `ModelSelectorLogo` from AI Elements (`models.dev/logos/<slug>.svg`).
 */
export function providerForModel(
  harness: HarnessName,
  model: string,
): string | undefined {
  if (model.includes("/")) {
    const prefix = model.split("/", 1)[0];
    if (prefix === "anthropic") return "anthropic";
    if (prefix === "openai") return "openai";
    if (prefix === "google") return "google";
    return prefix || undefined;
  }

  switch (harness) {
    case AgentProvider.ClaudeCode:
      return "anthropic";
    case AgentProvider.Codex:
      return "openai";
    default:
      return undefined;
  }
}
