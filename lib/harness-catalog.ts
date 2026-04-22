import type { AgentProviderName, SandboxProviderName } from "agentbox-sdk";

export type HarnessName = AgentProviderName;

export const HARNESSES: HarnessName[] = ["claude-code", "opencode", "codex"];

export const HARNESS_LABELS: Record<HarnessName, string> = {
  "claude-code": "Claude Code",
  opencode: "OpenCode",
  codex: "Codex",
};

export const HARNESS_MODELS: Record<HarnessName, string[]> = {
  "claude-code": ["sonnet", "opus", "haiku"],
  opencode: [
    "anthropic/claude-sonnet-4-6",
    "anthropic/claude-opus-4-7",
    "openai/gpt-5.4",
  ],
  codex: ["gpt-5.4"],
};

export const SUPPORTED_SANDBOXES: SandboxProviderName[] = [
  "e2b",
  "modal",
  "daytona",
  "vercel",
];

export const SANDBOX_LABELS: Record<string, string> = {
  e2b: "E2B",
  modal: "Modal",
  daytona: "Daytona",
  vercel: "Vercel",
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
    case "claude-code":
      return "anthropic";
    case "codex":
      return "openai";
    default:
      return undefined;
  }
}
