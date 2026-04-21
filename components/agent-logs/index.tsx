"use client";

import { ClaudeEventsDisplay } from "./ClaudeCode";
import { CodexEventsDisplay } from "./Codex";
import { OpenCodeEventsDisplay } from "./OpenCode";
import type { ClaudeCodeEvent } from "./types/claude-code";
import type { CodexEvent } from "./types/codex";
import type { OpenCodeEvent } from "./types/opencode";

export type AgentHarness = "claude-code" | "codex" | "opencode";

interface Props {
  logs?: ClaudeCodeEvent[] | CodexEvent[] | OpenCodeEvent[] | null;
  isRunning?: boolean;
  showLast?: boolean;
  provider?: AgentHarness | null;
  className?: string;
}

export function AgentJobLogsDisplay({
  logs,
  isRunning,
  showLast,
  provider = "claude-code",
  className,
}: Props) {
  const effectiveProvider = provider ?? "claude-code";
  const safeLogs = logs ?? [];

  if (effectiveProvider === "codex") {
    return (
      <CodexEventsDisplay
        events={safeLogs as CodexEvent[]}
        showLast={showLast}
        isRunning={isRunning}
        className={className}
      />
    );
  }

  if (effectiveProvider === "opencode") {
    return (
      <OpenCodeEventsDisplay
        events={safeLogs as OpenCodeEvent[]}
        showLast={showLast}
        isRunning={isRunning}
        className={className}
      />
    );
  }

  return (
    <ClaudeEventsDisplay
      showLast={showLast}
      events={safeLogs as ClaudeCodeEvent[]}
      isRunning={isRunning}
      className={className}
    />
  );
}
