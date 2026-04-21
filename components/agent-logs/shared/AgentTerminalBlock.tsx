import React from "react";
import {
  Terminal,
  TerminalActions,
  TerminalContent,
  TerminalCopyButton,
  TerminalHeader,
  TerminalTitle,
} from "@/components/ai-elements/terminal";

interface AgentTerminalBlockProps {
  command?: string | null;
  output?: string | null;
  isStreaming?: boolean;
  className?: string;
}

export const AgentTerminalBlock: React.FC<AgentTerminalBlockProps> = ({
  command,
  output,
  isStreaming = false,
  className,
}) => {
  const trimmedCommand = command?.trim() ?? "";
  const trimmedOutput = output?.trim() ?? "";

  const combined = [
    trimmedCommand ? `$ ${trimmedCommand}` : null,
    trimmedOutput || null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <Terminal
      output={combined}
      isStreaming={isStreaming}
      className={className}
    >
      <TerminalHeader>
        <TerminalTitle />
        <TerminalActions>
          <TerminalCopyButton />
        </TerminalActions>
      </TerminalHeader>
      <TerminalContent />
    </Terminal>
  );
};
