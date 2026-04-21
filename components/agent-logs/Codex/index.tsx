import React, { useMemo, useRef } from "react";
import {
  Terminal,
  Zap as Lightning,
  Wrench,
  FilePlus as FilePlusIcon,
  Pencil as PencilSimpleIcon,
  ArrowRight,
  Bot as RobotIcon,
} from "lucide-react";
import { Markdown } from "@/components/markdown";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/lib/utils";
import { AgentToolCallTree } from "../shared/AgentToolCallTree";
import { AgentTodoList } from "../shared/AgentTodoList";
import { AgentTerminalBlock } from "../shared/AgentTerminalBlock";
import {
  Base64ImageBlock,
  getBase64ImageSrc,
  isBase64ImageBlock,
} from "../shared/image-utils";
import type {
  AgentToolCall,
  AgentToolIconMap,
  AgentToolRendererConfig,
} from "../types";
import type { CodexEvent } from "../types/codex";
import {
  buildDisplayEntries,
  type CodexCollabToolAgentState,
  type CodexDisplayEntry,
  type CodexFileChange,
  type CodexTodoItem,
} from "../types/codex-display-entries";
import type { AgentTodo } from "../types";

export interface CodexParsedLogDisplayProps {
  events?: CodexEvent[] | null;
  showLast?: boolean;
  isRunning?: boolean;
  className?: string;
}

type CodexToolEntry = Extract<
  CodexDisplayEntry,
  { kind: "command" | "mcp_tool_call" | "collab_tool_call" }
>;

type CodexSyntheticToolEntry =
  | {
      kind: "subagent_prompt";
      prompt: string;
    }
  | {
      kind: "subagent_thread";
      threadId: string;
      state?: CodexCollabToolAgentState;
    };

type CodexRenderableToolEntry = CodexToolEntry | CodexSyntheticToolEntry;

type CodexToolCall = AgentToolCall & {
  entry: CodexRenderableToolEntry;
};

const CODEX_ICON_MAP: AgentToolIconMap = {
  command: Terminal,
  mcp_tool_call: Wrench,
  collab_tool_call: RobotIcon,
  SubagentPrompt: ArrowRight,
  SubagentThread: RobotIcon,
};

export const CodexEventsDisplay: React.FC<CodexParsedLogDisplayProps> = ({
  events,
  showLast = false,
  isRunning = false,
  className,
}) => {
  const entries = useMemo(() => {
    if (!events?.length) {
      return [];
    }
    return buildDisplayEntries(events);
  }, [events]);

  const visibleEntries = showLast ? entries.slice(-1) : entries;

  const toolCalls = useMemo<CodexToolCall[]>(
    () =>
      visibleEntries
        .filter(
          (entry): entry is CodexToolEntry =>
            entry.kind === "command" ||
            entry.kind === "mcp_tool_call" ||
            entry.kind === "collab_tool_call",
        )
        .map(createCodexToolCall),
    [visibleEntries],
  );

  const toolCallMap = useMemo(
    () =>
      new Map<string, CodexToolCall>(toolCalls.map((tool) => [tool.id, tool])),
    [toolCalls],
  );

  const manuallyCollapsedRef = useRef<Set<string>>(new Set());

  const [expandedTools, setExpandedTools] = React.useState<Set<string>>(() => {
    const initialExpanded = new Set<string>();
    toolCalls.forEach((tool) => {
      if (tool.entry.kind === "collab_tool_call" && tool.children?.length) {
        initialExpanded.add(tool.id);
      }
    });
    return initialExpanded;
  });

  React.useEffect(() => {
    setExpandedTools((prev) => {
      const validIds = new Set(toolCalls.map((tool) => tool.id));
      const next = new Set<string>();
      let changed = false;

      prev.forEach((id) => {
        if (validIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });

      toolCalls.forEach((tool) => {
        if (
          tool.entry.kind === "collab_tool_call" &&
          tool.children?.length &&
          !next.has(tool.id) &&
          !manuallyCollapsedRef.current.has(tool.id)
        ) {
          next.add(tool.id);
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [toolCalls]);

  const toggleTool = React.useCallback((toolId: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
        manuallyCollapsedRef.current.add(toolId);
      } else {
        next.add(toolId);
        manuallyCollapsedRef.current.delete(toolId);
      }
      return next;
    });
  }, []);

  const toolRendererConfig = React.useMemo<AgentToolRendererConfig>(
    () => ({
      iconMap: CODEX_ICON_MAP,
      formatDescription: (toolCall) =>
        formatCodexToolDescription((toolCall as CodexToolCall).entry),
      renderResult: (toolCall) =>
        renderCodexToolResult((toolCall as CodexToolCall).entry),
    }),
    [],
  );

  if (visibleEntries.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {visibleEntries.map((entry) => {
        if (
          entry.kind === "command" ||
          entry.kind === "mcp_tool_call" ||
          entry.kind === "collab_tool_call"
        ) {
          const tool = toolCallMap.get(entry.id);
          if (!tool) {
            return null;
          }
          return (
            <AgentToolCallTree
              key={tool.id}
              tool={tool}
              isRunning={entry.status === "running"}
              isExpanded={expandedTools.has(tool.id)}
              expandedTools={expandedTools}
              onToggle={toggleTool}
              config={toolRendererConfig}
            />
          );
        }

        return <EntryRenderer key={entry.id} entry={entry} />;
      })}

      {isRunning && !entries.length && <Shimmer>Waiting for Codex...</Shimmer>}
    </div>
  );
};

function createCodexToolCall(entry: CodexToolEntry): CodexToolCall {
  if (entry.kind === "collab_tool_call") {
    const children: CodexToolCall[] = [];

    if (entry.prompt?.trim()) {
      children.push(
        createCodexSyntheticToolCall(`${entry.id}-prompt`, "SubagentPrompt", {
          kind: "subagent_prompt",
          prompt: entry.prompt,
        }),
      );
    }

    const threadIds =
      entry.receiverThreadIds.length > 0
        ? entry.receiverThreadIds
        : Object.keys(entry.agentsStates || {});

    children.push(
      ...threadIds.map((threadId) =>
        createCodexSyntheticToolCall(
          `${entry.id}-thread-${threadId}`,
          "SubagentThread",
          {
            kind: "subagent_thread",
            threadId,
            state: entry.agentsStates?.[threadId],
          },
        ),
      ),
    );

    return {
      id: entry.id,
      name: "collab_tool_call",
      input: {},
      hasResult: false,
      parentId: null,
      children,
      entry,
    };
  }

  const name = entry.kind === "command" ? "command" : "mcp_tool_call";
  return {
    id: entry.id,
    name,
    input: {},
    result: entry,
    hasResult: entry.status !== "running",
    parentId: null,
    children: [],
    entry,
  };
}

function createCodexSyntheticToolCall(
  id: string,
  name: string,
  entry: CodexSyntheticToolEntry,
): CodexToolCall {
  return {
    id,
    name,
    input: {},
    result: entry,
    hasResult: true,
    parentId: null,
    children: [],
    entry,
  };
}

function formatCodexToolDescription(entry: CodexRenderableToolEntry): string {
  if (entry.kind === "subagent_prompt") {
    return "Instructions";
  }

  if (entry.kind === "subagent_thread") {
    return `Sub-agent ${truncateThreadId(entry.threadId)}`;
  }

  if (entry.kind === "command") {
    const snippet = entry.command?.trim();
    const commandLabel = snippet ? `${snippet}` : "Command";
    return commandLabel;
  }

  if (entry.kind === "collab_tool_call") {
    return formatCodexCollabDescription(entry);
  }

  const server = entry.server ? `[${entry.server}]` : null;
  const toolLabel = entry.tool || "MCP Tool Call";
  return server ? `${server} ${toolLabel}` : toolLabel;
}

function renderCodexToolResult(entry: CodexRenderableToolEntry) {
  if (entry.kind === "subagent_prompt") {
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <Markdown>{entry.prompt}</Markdown>
      </div>
    );
  }

  if (entry.kind === "subagent_thread") {
    const statusLabel = formatCodexStatus(entry.state?.status);
    const report = entry.state?.message?.trim();

    return (
      <div className="space-y-2">
        {statusLabel ? (
          <p className="text-muted-foreground text-[11px] font-medium">
            Status: {statusLabel}
          </p>
        ) : null}
        {report ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <Markdown>{report}</Markdown>
          </div>
        ) : null}
        {!report && !statusLabel ? (
          <p className="text-muted-foreground text-xs">No report yet</p>
        ) : null}
      </div>
    );
  }

  if (entry.kind === "command") {
    return (
      <AgentTerminalBlock
        command={entry.command ?? ""}
        output={entry.output ?? ""}
      />
    );
  }

  if (entry.kind !== "mcp_tool_call") {
    return null;
  }

  const contentBlocks = entry.result?.content ?? [];
  const textBlocks = contentBlocks
    .map((block: (typeof contentBlocks)[number]) =>
      block?.type === "text" && typeof block.text === "string"
        ? block.text
        : "",
    )
    .filter(Boolean);
  const imageBlocks: Base64ImageBlock[] = contentBlocks.filter(
    (block: (typeof contentBlocks)[number]): block is Base64ImageBlock =>
      isBase64ImageBlock(block),
  );
  const structuredContent = entry.result?.structured_content;

  const hasResultContent =
    textBlocks.length > 0 ||
    imageBlocks.length > 0 ||
    (structuredContent !== undefined && structuredContent !== null) ||
    (entry.error !== undefined && entry.error !== null);

  return (
    <div className="space-y-3">
      {entry.arguments && (
        <div>
          <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
            Arguments
          </p>
          <pre className="bg-muted/40 rounded-md px-3 py-2 font-mono text-[11px] whitespace-pre-wrap">
            {formatInspectable(entry.arguments)}
          </pre>
        </div>
      )}

      {textBlocks.map((text: string, idx: number) => (
        <Markdown
          key={`${entry.id}-text-${idx}`}
          className="prose prose-sm dark:prose-invert"
        >
          {text}
        </Markdown>
      ))}

      {imageBlocks.length > 0 && (
        <div className="space-y-2">
          {imageBlocks.map((block, idx) => {
            const src = getBase64ImageSrc(block);
            if (!src) {
              return null;
            }
            return (
              <AspectRatio key={`${entry.id}-img-${idx}`} ratio={16 / 9}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Tool result image ${idx + 1}`}
                  className="bg-muted absolute inset-0 h-full w-full rounded-md border object-contain"
                />
              </AspectRatio>
            );
          })}
        </div>
      )}

      {structuredContent !== undefined && structuredContent !== null && (
        <div>
          <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
            Structured Content
          </p>
          <pre className="bg-muted/40 rounded-md px-3 py-2 font-mono text-[11px] whitespace-pre-wrap">
            {formatInspectable(structuredContent)}
          </pre>
        </div>
      )}

      {entry.error !== undefined && entry.error !== null && (
        <div>
          <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
            Error
          </p>
          <pre className="border-destructive/50 bg-destructive/5 text-destructive rounded-md border px-3 py-2 font-mono text-[11px] whitespace-pre-wrap">
            {formatInspectable(entry.error)}
          </pre>
        </div>
      )}

      {!hasResultContent && !entry.arguments && (
        <p className="text-muted-foreground text-xs">No output yet</p>
      )}
    </div>
  );
}

function formatCodexCollabDescription(
  entry: Extract<CodexDisplayEntry, { kind: "collab_tool_call" }>,
): string {
  const receiverCount = entry.receiverThreadIds.length;

  switch (entry.tool) {
    case "spawn_agent":
      return receiverCount > 0
        ? `Spawn ${receiverCount} sub-agent${receiverCount > 1 ? "s" : ""}`
        : "Spawn sub-agent";
    case "wait":
      return receiverCount > 0
        ? `Wait for ${receiverCount} sub-agent report${receiverCount > 1 ? "s" : ""}`
        : "Wait for sub-agent report";
    case "close_agent":
      return receiverCount > 0
        ? `Close ${receiverCount} sub-agent${receiverCount > 1 ? "s" : ""}`
        : "Close sub-agent";
    default:
      return entry.tool
        ? entry.tool
            .replace(/[_-]+/g, " ")
            .replace(/\b\w/g, (char) => char.toUpperCase())
        : "Sub-agent call";
  }
}

function formatCodexStatus(status: unknown): string | null {
  if (!status) {
    return null;
  }

  if (typeof status === "string") {
    return status.replace(/[_-]+/g, " ");
  }

  try {
    return JSON.stringify(status);
  } catch {
    return String(status);
  }
}

function truncateThreadId(threadId: string): string {
  if (threadId.length <= 14) {
    return threadId;
  }

  return `${threadId.slice(0, 8)}…${threadId.slice(-6)}`;
}

function formatInspectable(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const EntryRenderer = ({ entry }: { entry: CodexDisplayEntry }) => {
  switch (entry.kind) {
    case "status": {
      const toneClasses =
        entry.tone === "success"
          ? {
              icon: "text-emerald-500",
              label: "text-emerald-700 dark:text-emerald-300",
              detail: "text-emerald-600/80 dark:text-emerald-300/80",
            }
          : entry.tone === "error"
            ? {
                icon: "text-destructive",
                label: "text-destructive",
                detail: "text-destructive/80",
              }
            : {
                icon: "text-muted-foreground",
                label: "",
                detail: "text-muted-foreground",
              };
      return (
        <div className="flex items-center gap-2">
          <Lightning className={cn("h-4 w-4", toneClasses.icon)} />
          <div>
            <p className={cn("font-medium", toneClasses.label)}>
              {entry.label}
            </p>
            {entry.detail && (
              <p className={cn(toneClasses.detail)}>{entry.detail}</p>
            )}
          </div>
        </div>
      );
    }
    case "reasoning":
      return (
        <Markdown
          className={cn(
            "prose prose-sm text-muted-foreground dark:prose-invert",
          )}
        >
          {entry.text}
        </Markdown>
      );
    case "message":
      return (
        <Markdown className={cn("prose prose-sm dark:prose-invert")}>
          {entry.text}
        </Markdown>
      );
    case "todos": {
      const todos = mapCodexTodosToAgentTodos(entry.items);
      if (!todos.length) {
        return (
          <p className={cn("text-muted-foreground")}>No todos available</p>
        );
      }
      return <AgentTodoList todos={todos} />;
    }
    case "file_change": {
      const changeLines = entry.changes.length
        ? entry.changes.map((change) => ({
            text: formatFileChangeDescription(change),
            Icon: getFileChangeIcon(change.kind) as React.ComponentType<{
              className?: string;
            }>,
          }))
        : [
            {
              text: "File change recorded",
              Icon: getFileChangeIcon() as React.ComponentType<{
                className?: string;
              }>,
            },
          ];
      return (
        <div className="text-muted-foreground space-y-1">
          {changeLines.map(({ text, Icon }, idx) => (
            <div
              key={`${entry.id}-change-${idx}`}
              className="flex items-center gap-2"
            >
              <Icon className="mt-0.5 h-3 w-3 flex-shrink-0" />
              <p>{text}</p>
            </div>
          ))}
        </div>
      );
    }
    case "raw": {
      const label =
        typeof entry.event?.method === "string"
          ? entry.event.method
          : "unknown";
      return (
        <details className="space-y-1">
          <summary className="text-muted-foreground cursor-pointer text-xs font-medium tracking-wide uppercase">
            Unhandled event ({label})
          </summary>
          <pre className="bg-background/60 rounded-md px-3 py-2 text-xs">
            <code>{JSON.stringify(entry.event, null, 2)}</code>
          </pre>
        </details>
      );
    }
    default:
      return null;
  }
};

function mapCodexTodosToAgentTodos(items: CodexTodoItem[]): AgentTodo[] {
  return items.map((item, index) => ({
    id: item.id || `todo-${index}`,
    content: item.text || "Untitled task",
    status: item.completed ? "completed" : "pending",
  }));
}

const FILE_CHANGE_KIND_LABELS: Record<string, string> = {
  create: "Created",
  add: "Added",
  write: "Updated",
  update: "Updated",
  edit: "Updated",
  modify: "Updated",
  delete: "Deleted",
  remove: "Removed",
};

const FILE_CHANGE_DEFAULT_ICON = FilePlusIcon;

const FILE_CHANGE_ICON_MAP: Record<string, React.ElementType> = {
  create: FilePlusIcon,
  add: FilePlusIcon,
  write: FilePlusIcon,
  update: PencilSimpleIcon,
  edit: PencilSimpleIcon,
  modify: PencilSimpleIcon,
  delete: Wrench,
  remove: Wrench,
};

function getFileChangeIcon(kind?: string): React.ElementType {
  if (!kind) {
    return FILE_CHANGE_DEFAULT_ICON;
  }
  const normalizedKind = kind.toLowerCase();
  return FILE_CHANGE_ICON_MAP[normalizedKind] || FILE_CHANGE_DEFAULT_ICON;
}

function formatFileChangeDescription(change: CodexFileChange): string {
  const normalizedKind =
    typeof change.kind === "string" ? change.kind.toLowerCase() : null;
  const action =
    (normalizedKind && FILE_CHANGE_KIND_LABELS[normalizedKind]) ||
    (typeof change.kind === "string"
      ? change.kind.charAt(0).toUpperCase() + change.kind.slice(1)
      : "Changed");
  const target = change.path || "a file";
  return `${action} ${target}`;
}
