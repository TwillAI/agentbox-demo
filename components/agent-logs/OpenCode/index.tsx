import React from "react";
import { Markdown } from "@/components/markdown";
import { CodeSnippet } from "@/components/code-snippet";
import { CodeDiffSnippet } from "@/components/code-diff-snippet";
import { AgentToolCallTree } from "../shared/AgentToolCallTree";
import { AgentTodoList } from "../shared/AgentTodoList";
import { AgentTerminalBlock } from "../shared/AgentTerminalBlock";
import {
  defaultToolIconMap,
  formatToolDescription,
  getLanguageFromPath,
} from "../shared/tooling";
import type {
  AgentToolCall,
  AgentToolRendererConfig,
  AgentTodo,
} from "../types";
import type {
  OpenCodeEvent,
  OpenCodeLogPart,
  OpenCodeToolState,
} from "../types/opencode";
import { cn } from "@/lib/utils";

interface Props {
  events?: OpenCodeEvent[] | null;
  showLast?: boolean;
  isRunning?: boolean;
  className?: string;
}

type OpenCodeToolStatus =
  | "running"
  | "completed"
  | "failed"
  | "pending"
  | "unknown";

type OpenCodeToolCall = AgentToolCall & {
  rawName?: string;
  status: OpenCodeToolStatus;
  state?: OpenCodeToolState;
  history: OpenCodeToolState[];
};

type OpenCodeDisplayEntry =
  | { id: string; kind: "text"; text: string }
  | { id: string; kind: "tool"; toolId: string; status: OpenCodeToolStatus }
  | { id: string; kind: "step_start"; snapshot?: string }
  | {
      id: string;
      kind: "step_finish";
      reason?: string;
      snapshot?: string;
      cost?: number;
      tokens?: {
        input?: number;
        output?: number;
        reasoning?: number;
        cache?: {
          read?: number;
          write?: number;
        };
      };
    }
  | { id: string; kind: "raw"; event: OpenCodeEvent };

const OPEN_CODE_TOOL_NAME_MAP: Record<string, string> = {
  bash: "Bash",
  edit: "Edit",
  write: "Write",
  writefile: "Write",
  glob: "Glob",
  grep: "Grep",
  read: "Read",
  list: "LS",
  ls: "LS",
  todowrite: "TodoWrite",
  todoread: "TodoRead",
  websearch: "Search",
  command: "Command",
};

export const OpenCodeEventsDisplay: React.FC<Props> = ({
  events,
  showLast = false,
  isRunning = false,
  className,
}) => {
  const safeEvents = React.useMemo(() => events ?? [], [events]);

  const { entries, toolCalls } = React.useMemo(() => {
    return buildOpenCodeDisplayEntries(safeEvents);
  }, [safeEvents]);

  // Group entries like ClaudeCode does (text vs tools groups)
  const groupedEntries = React.useMemo(() => {
    const groups: Array<{
      type: "text" | "tools";
      entries: OpenCodeDisplayEntry[];
    }> = [];

    let currentToolGroup: OpenCodeDisplayEntry[] = [];

    for (const entry of entries) {
      if (entry.kind === "text") {
        if (!entry.text.trim()) continue;
        if (currentToolGroup.length > 0) {
          groups.push({ type: "tools", entries: currentToolGroup });
          currentToolGroup = [];
        }
        groups.push({ type: "text", entries: [entry] });
      } else if (entry.kind === "tool") {
        currentToolGroup.push(entry);
      }
      // Skip step_start, step_finish and raw entries for cleaner display
    }

    if (currentToolGroup.length > 0) {
      groups.push({ type: "tools", entries: currentToolGroup });
    }

    return groups;
  }, [entries]);

  const visibleGroups = React.useMemo(
    () => (showLast ? groupedEntries.slice(-1) : groupedEntries),
    [groupedEntries, showLast],
  );

  const toolCallMap = React.useMemo(() => {
    const allToolIds = new Set<string>();
    visibleGroups.forEach((group) => {
      if (group.type === "tools") {
        group.entries.forEach((entry) => {
          if (entry.kind === "tool") {
            allToolIds.add(entry.toolId);
          }
        });
      }
    });

    return new Map<string, OpenCodeToolCall>(
      Array.from(toolCalls.entries()).filter(([id]) => allToolIds.has(id)),
    );
  }, [toolCalls, visibleGroups]);

  const [expandedTools, setExpandedTools] = React.useState<Set<string>>(
    new Set(),
  );

  React.useEffect(() => {
    setExpandedTools((prev) => {
      const validIds = new Set(toolCallMap.keys());
      const next = new Set<string>();
      let changed = false;

      prev.forEach((id) => {
        if (validIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [toolCallMap]);

  const toggleTool = React.useCallback((toolId: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  }, []);

  const rendererConfig = React.useMemo<AgentToolRendererConfig>(
    () => ({
      iconMap: defaultToolIconMap,
      formatDescription: (tool) =>
        formatOpenCodeToolDescription(tool as OpenCodeToolCall),
      renderResult: (tool) =>
        renderOpenCodeToolResult(tool as OpenCodeToolCall),
      customToolRenderers: {
        TodoWrite: ({ tool, isChild }) => {
          const todos = extractTodosFromInput((tool as OpenCodeToolCall).input);
          if (!todos.length) {
            return null;
          }
          return (
            <div className={`py-1 ${isChild ? "ml-5.5" : ""}`}>
              <AgentTodoList todos={todos} />
            </div>
          );
        },
      },
    }),
    [],
  );

  if (visibleGroups.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-3", className)}>
      {visibleGroups.map((group, groupIdx) => (
        <div key={groupIdx}>
          {group.type === "text" && group.entries[0] && (
            <div className="text-sm">
              <Markdown>
                {
                  (
                    group.entries[0] as Extract<
                      OpenCodeDisplayEntry,
                      { kind: "text" }
                    >
                  ).text
                }
              </Markdown>
            </div>
          )}

          {group.type === "tools" && (
            <div className="space-y-2">
              {group.entries.map((entry) => {
                if (entry.kind !== "tool") return null;
                const tool = toolCallMap.get(entry.toolId);
                if (!tool) return null;
                return (
                  <AgentToolCallTree
                    key={entry.id}
                    tool={tool}
                    isRunning={entry.status === "running"}
                    isExpanded={expandedTools.has(entry.toolId)}
                    expandedTools={expandedTools}
                    onToggle={toggleTool}
                    config={rendererConfig}
                  />
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

function buildOpenCodeDisplayEntries(events: OpenCodeEvent[]): {
  entries: OpenCodeDisplayEntry[];
  toolCalls: Map<string, OpenCodeToolCall>;
} {
  const entries: OpenCodeDisplayEntry[] = [];
  const toolCalls = new Map<string, OpenCodeToolCall>();
  const toolEntryMap = new Map<
    string,
    OpenCodeDisplayEntry & { kind: "tool" }
  >();
  // Track message roles so we can filter out user-echo parts.
  const userMessageIds = new Set<string>();
  // Track streamed text parts by partID so we can apply deltas.
  const textEntryById = new Map<
    string,
    OpenCodeDisplayEntry & { kind: "text" }
  >();

  events.forEach((event, index) => {
    // Raw opencode events arrive as `{ type, properties }` envelopes. Older
    // callers may flatten `part` onto the event itself, so accept both.
    const properties = event.properties ?? {};
    const part = properties.part ?? event.part;
    const baseId = part?.id || `${event.type}-${index}`;

    // Track user messages so their echoed text parts don't appear as
    // assistant output.
    if (event.type === "message.updated") {
      const info = properties.info;
      if (info?.id && info.role === "user") {
        userMessageIds.add(info.id);
      }
      return;
    }

    // Streaming text deltas – append to the existing text entry for the part.
    if (event.type === "message.part.delta") {
      const partID = properties.partID;
      const delta = properties.delta;
      const messageID = properties.messageID;
      if (
        partID &&
        typeof delta === "string" &&
        properties.field === "text" &&
        (!messageID || !userMessageIds.has(messageID))
      ) {
        const existing = textEntryById.get(partID);
        if (existing) {
          existing.text += delta;
        } else {
          const entry: OpenCodeDisplayEntry & { kind: "text" } = {
            id: partID,
            kind: "text",
            text: delta,
          };
          entries.push(entry);
          textEntryById.set(partID, entry);
        }
      }
      return;
    }

    if (!part) {
      entries.push({ id: baseId, kind: "raw", event });
      return;
    }

    // Skip parts that belong to the user's own message.
    if (part.messageID && userMessageIds.has(part.messageID)) {
      return;
    }

    if (isOpenCodeTextPart(part)) {
      const text = part.text || "";
      const partId = part.id || baseId;
      const existing = textEntryById.get(partId);
      if (existing) {
        if (text.length > existing.text.length) {
          existing.text = text;
        }
      } else {
        const entry: OpenCodeDisplayEntry & { kind: "text" } = {
          id: partId,
          kind: "text",
          text,
        };
        entries.push(entry);
        textEntryById.set(partId, entry);
      }
      return;
    }

    if (isOpenCodeToolPart(part)) {
      const toolId = part.callID || part.id || baseId;
      let toolCall = toolCalls.get(toolId);

      if (!toolCall) {
        toolCall = createToolCall(toolId, part);
        toolCalls.set(toolId, toolCall);
        const entry: OpenCodeDisplayEntry & { kind: "tool" } = {
          id: toolId,
          kind: "tool",
          toolId,
          status: toolCall.status,
        };
        entries.push(entry);
        toolEntryMap.set(toolId, entry);
      } else {
        updateToolCall(toolCall, part);
        const entry = toolEntryMap.get(toolId);
        if (entry) {
          entry.status = toolCall.status;
        }
      }
      return;
    }

    if (isOpenCodeStepStartPart(part)) {
      entries.push({ id: baseId, kind: "step_start", snapshot: part.snapshot });
      return;
    }

    if (isOpenCodeStepFinishPart(part)) {
      entries.push({
        id: baseId,
        kind: "step_finish",
        reason: part.reason,
        snapshot: part.snapshot,
        cost: part.cost,
        tokens: part.tokens,
      });
      return;
    }

    entries.push({ id: baseId, kind: "raw", event });
  });

  return { entries, toolCalls };
}

function createToolCall(
  toolId: string,
  part: Extract<OpenCodeLogPart, { type: "tool" }>,
): OpenCodeToolCall {
  const normalizedName = normalizeOpenCodeToolName(part.tool);
  const status = normalizeOpenCodeToolStatus(part.state?.status);
  const stateCopy = part.state
    ? { ...part.state, input: { ...(part.state.input || {}) } }
    : undefined;

  return {
    id: toolId,
    name: normalizedName,
    rawName: part.tool,
    input: stateCopy?.input || {},
    result: stateCopy?.output ?? stateCopy?.metadata?.output,
    hasResult:
      status !== "running" && status !== "pending"
        ? true
        : Boolean(stateCopy?.output),
    parentId: null,
    children: [],
    status,
    state: stateCopy,
    history: stateCopy ? [stateCopy] : [],
  };
}

function updateToolCall(
  toolCall: OpenCodeToolCall,
  part: Extract<OpenCodeLogPart, { type: "tool" }>,
) {
  const status = normalizeOpenCodeToolStatus(part.state?.status);
  const stateCopy = part.state
    ? { ...part.state, input: { ...(part.state.input || {}) } }
    : undefined;

  if (stateCopy) {
    toolCall.state = stateCopy;
    toolCall.history = [...toolCall.history, stateCopy];
    toolCall.input = stateCopy.input || toolCall.input;
    if (stateCopy.output !== undefined || stateCopy.metadata?.output) {
      toolCall.result =
        stateCopy.output ??
        (stateCopy.metadata?.output as unknown) ??
        toolCall.result;
    }
  }

  toolCall.status = status;
  toolCall.hasResult =
    status !== "running" && status !== "pending"
      ? true
      : toolCall.hasResult || Boolean(toolCall.result);
}

function normalizeOpenCodeToolStatus(status?: string): OpenCodeToolStatus {
  if (!status) {
    return "running";
  }
  const normalized = status.toLowerCase();
  if (normalized === "completed" || normalized === "success") {
    return "completed";
  }
  if (normalized === "failed" || normalized === "error") {
    return "failed";
  }
  if (normalized === "pending") {
    return "pending";
  }
  if (normalized === "running" || normalized === "in_progress") {
    return "running";
  }
  return "unknown";
}

function normalizeOpenCodeToolName(name?: string): string {
  if (!name) {
    return "Tool";
  }
  const normalized = name.toLowerCase();
  return (
    OPEN_CODE_TOOL_NAME_MAP[normalized] ||
    normalized.charAt(0).toUpperCase() + normalized.slice(1)
  );
}

function formatOpenCodeToolDescription(tool: OpenCodeToolCall): string {
  if (tool.state?.title) {
    return tool.state.title;
  }
  return formatToolDescription(tool.name, tool.input);
}

function renderOpenCodeToolResult(tool: OpenCodeToolCall) {
  const state = tool.state;
  if (!state) {
    return null;
  }

  // Special rendering for Read tool
  if (tool.name === "Read" && (state.input?.path || state.input?.filePath)) {
    const filePath = (state.input.path || state.input.filePath) as string;
    const content = extractToolOutput(state);

    // Check for image attachments
    const attachments = state.attachments as
      | Array<{
          type?: string;
          mime?: string;
          url?: string;
        }>
      | undefined;

    const imageAttachment = attachments?.find(
      (att) =>
        att.type === "file" &&
        att.mime?.startsWith("image/") &&
        att.url?.startsWith("data:"),
    );

    if (imageAttachment?.url) {
      return (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-medium">
            {filePath.split("/").pop()}
          </p>
          <div className="overflow-hidden rounded-md border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageAttachment.url}
              alt={`Content of ${filePath}`}
              width={800}
              height={600}
              className="h-auto max-w-full"
              style={{ width: "auto", height: "auto" }}
            />
          </div>
          {content && (
            <p className="text-muted-foreground text-xs">{content}</p>
          )}
        </div>
      );
    }

    if (content) {
      return (
        <CodeSnippet
          language={getLanguageFromPath(filePath)}
          title={filePath.split("/").pop()}
        >
          {content}
        </CodeSnippet>
      );
    }
  }

  // Special rendering for Write tool
  if (
    (tool.name === "Write" || tool.name === "WriteFile") &&
    (state.input?.path || state.input?.filePath)
  ) {
    const filePath = (state.input.path || state.input.filePath) as string;
    const content = (state.input.contents || state.input.content) as string;

    if (content) {
      return (
        <CodeSnippet
          language={getLanguageFromPath(filePath)}
          title={filePath.split("/").pop()}
        >
          {content}
        </CodeSnippet>
      );
    }
  }

  // Special rendering for Edit tool
  if (tool.name === "Edit") {
    // Handle both old/new string format and oldString/newString format
    const oldString = (state.input?.old_string ||
      state.input?.oldString) as string;
    const newString = (state.input?.new_string ||
      state.input?.newString) as string;
    const filePath = (state.input?.file_path ||
      state.input?.filePath) as string;

    if (oldString !== undefined && newString !== undefined) {
      return (
        <CodeDiffSnippet
          oldString={oldString}
          newString={newString}
          filePath={filePath}
          maxHeight="300px"
          showLineNumbers={false}
        />
      );
    }
  }

  // Default rendering for other tools
  const hasInput = state.input && Object.keys(state.input).length > 0;
  const output = extractToolOutput(state);
  const metadata = extractToolMetadata(state);
  const attachments = extractAttachments(state);
  const durationSeconds =
    state.time?.start && state.time?.end
      ? (state.time.end - state.time.start) / 1000
      : null;

  if (
    !hasInput &&
    !output &&
    !metadata &&
    !attachments.length &&
    durationSeconds === null
  ) {
    return null;
  }

  const bashCommand =
    tool.name === "Bash" && state.input?.command
      ? String(state.input.command)
      : null;

  return (
    <div className="space-y-3">
      {bashCommand !== null ? (
        <AgentTerminalBlock command={bashCommand} output={output ?? ""} />
      ) : null}

      {bashCommand === null && output ? (
        <pre className="font-mono whitespace-pre-wrap">{output}</pre>
      ) : null}

      {!output && hasInput && tool.name !== "Bash" ? (
        <div>
          <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
            Input
          </p>
          <pre className="bg-muted/40 rounded-md px-3 py-2 font-mono text-[11px] whitespace-pre-wrap">
            {formatInspectable(state.input)}
          </pre>
        </div>
      ) : null}

      {attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map((attachment, idx) => (
            <div
              key={idx}
              className="relative overflow-hidden rounded-md border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={attachment.url}
                alt={`Attachment ${idx + 1}`}
                width={800}
                height={600}
                className="h-auto max-w-full"
                style={{ width: "auto", height: "auto" }}
              />
            </div>
          ))}
        </div>
      )}

      {durationSeconds !== null ? (
        <p className="text-muted-foreground text-[11px]">
          Took {durationSeconds.toFixed(2)}s
        </p>
      ) : null}
    </div>
  );
}

function extractToolOutput(state: OpenCodeToolState): string | null {
  if (typeof state.output === "string" && state.output.trim().length > 0) {
    return state.output.trim();
  }
  const metadataOutput = state.metadata?.output;
  if (typeof metadataOutput === "string" && metadataOutput.trim().length > 0) {
    return metadataOutput.trim();
  }
  if (metadataOutput && typeof metadataOutput === "object") {
    return formatInspectable(metadataOutput);
  }
  return null;
}

function extractToolMetadata(
  state: OpenCodeToolState,
): Record<string, unknown> | null {
  if (!state.metadata) {
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { output, ...rest } = state.metadata;
  const keys = Object.keys(rest);
  if (!keys.length) {
    return null;
  }
  return rest;
}

function extractAttachments(state: OpenCodeToolState): Array<{
  type: string;
  mime: string;
  url: string;
}> {
  const attachments = state.attachments as
    | Array<{
        type?: string;
        mime?: string;
        url?: string;
      }>
    | undefined;

  if (!attachments) {
    return [];
  }

  return attachments.filter(
    (att): att is { type: string; mime: string; url: string } =>
      att.type === "file" &&
      typeof att.mime === "string" &&
      att.mime.startsWith("image/") &&
      typeof att.url === "string" &&
      att.url.startsWith("data:"),
  );
}

function extractTodosFromInput(input: Record<string, unknown>): AgentTodo[] {
  const maybeTodos = (input as { todos?: unknown }).todos;
  if (!Array.isArray(maybeTodos)) {
    return [];
  }

  return maybeTodos.map((todo, index) => {
    const todoObj = todo as {
      id?: string | number;
      text?: string;
      content?: string;
      description?: string;
      status?: string;
    };
    return {
      id: String(todoObj.id ?? `todo-${index}`),
      content:
        todoObj.text ||
        todoObj.content ||
        todoObj.description ||
        `Todo ${index + 1}`,
      status: normalizeTodoStatus(todoObj.status),
    };
  });
}

function normalizeTodoStatus(status?: string): AgentTodo["status"] {
  if (!status) {
    return "pending";
  }
  const normalized = status.toLowerCase();
  if (normalized === "completed" || normalized === "done") {
    return "completed";
  }
  if (normalized === "in_progress" || normalized === "working") {
    return "in_progress";
  }
  if (normalized === "cancelled" || normalized === "canceled") {
    return "cancelled";
  }
  return "pending";
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

function isOpenCodeTextPart(
  part: OpenCodeLogPart | undefined,
): part is Extract<OpenCodeLogPart, { type: "text" }> {
  return part?.type === "text";
}

function isOpenCodeToolPart(
  part: OpenCodeLogPart | undefined,
): part is Extract<OpenCodeLogPart, { type: "tool" }> {
  return part?.type === "tool";
}

function isOpenCodeStepStartPart(
  part: OpenCodeLogPart | undefined,
): part is Extract<OpenCodeLogPart, { type: "step-start" }> {
  return part?.type === "step-start";
}

function isOpenCodeStepFinishPart(
  part: OpenCodeLogPart | undefined,
): part is Extract<OpenCodeLogPart, { type: "step-finish" }> {
  return part?.type === "step-finish";
}
