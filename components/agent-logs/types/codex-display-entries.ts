import type { CodexEvent, CodexItem } from "./codex";

export type CodexMcpToolResult = {
  content?: CodexMcpToolResultContent[] | null;
  structured_content?: unknown;
};

export type CodexMcpToolResultContent = {
  type?: string;
  text?: string;
  data?: string;
  mimeType?: string;
  media_type?: string;
  source?: {
    type?: string;
    data?: string;
    media_type?: string;
  };
  [key: string]: unknown;
};

export type CodexTodoItem = {
  id?: string;
  text?: string;
  completed?: boolean;
};

export type CodexFileChange = {
  path?: string;
  kind?: string;
};

export type CodexCollabToolAgentState = {
  status?: unknown;
  message?: string | null;
};

export type CodexDisplayEntry =
  | {
      id: string;
      kind: "status";
      label: string;
      detail?: string;
      tone?: "default" | "success" | "error";
    }
  | {
      id: string;
      kind: "reasoning";
      text: string;
    }
  | {
      id: string;
      kind: "message";
      role: "assistant" | "user";
      text: string;
    }
  | {
      id: string;
      kind: "command";
      command?: string | null;
      output?: string | null;
      exitCode?: number | null;
      status: "running" | "completed" | "failed";
    }
  | {
      id: string;
      kind: "todos";
      items: CodexTodoItem[];
      status: "running" | "completed";
    }
  | {
      id: string;
      kind: "file_change";
      changes: CodexFileChange[];
    }
  | {
      id: string;
      kind: "mcp_tool_call";
      server?: string;
      tool?: string;
      arguments?: Record<string, unknown> | null;
      status: "running" | "completed" | "failed";
      result?: CodexMcpToolResult | null;
      error?: unknown;
    }
  | {
      id: string;
      kind: "collab_tool_call";
      tool?: string;
      prompt?: string | null;
      senderThreadId?: string;
      receiverThreadIds: string[];
      agentsStates?: Record<string, CodexCollabToolAgentState>;
      status: "running" | "completed" | "failed";
    }
  | {
      id: string;
      kind: "raw";
      event: CodexEvent;
    };

type MessageEntry = Extract<CodexDisplayEntry, { kind: "message" }>;
type ReasoningEntry = Extract<CodexDisplayEntry, { kind: "reasoning" }>;
type CommandEntry = Extract<CodexDisplayEntry, { kind: "command" }>;
type McpToolEntry = Extract<CodexDisplayEntry, { kind: "mcp_tool_call" }>;
type CollabToolEntry = Extract<CodexDisplayEntry, { kind: "collab_tool_call" }>;
type TodosEntry = Extract<CodexDisplayEntry, { kind: "todos" }>;
type ToolEntry = CommandEntry | McpToolEntry | CollabToolEntry;

const IGNORED_METHODS = new Set<string>([
  "configWarning",
  "warning",
  "account/rateLimits/updated",
  "thread/started",
  "thread/status/changed",
  "thread/tokenUsage/updated",
  "thread/compacted",
  "thread/contextCompaction/started",
  "thread/contextCompaction/completed",
  "turn/started",
  "turn/completed",
  "turn/diff/updated",
  "turn/plan/updated",
  "rawResponseItem/completed",
  "serverRequest/resolved",
  "remoteControl/status/changed",
]);

function normalizeArguments(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function normalizeAgentStates(
  value: unknown,
): Record<string, CodexCollabToolAgentState> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter(
    ([threadId, state]) =>
      typeof threadId === "string" &&
      state !== null &&
      typeof state === "object" &&
      !Array.isArray(state),
  );

  if (!entries.length) {
    return undefined;
  }

  return Object.fromEntries(
    entries.map(([threadId, state]) => [
      threadId,
      {
        status: (state as CodexCollabToolAgentState).status,
        message:
          typeof (state as CodexCollabToolAgentState).message === "string"
            ? (state as CodexCollabToolAgentState).message
            : null,
      },
    ]),
  );
}

function isFailedAgentStatus(status: unknown): boolean {
  if (!status) {
    return false;
  }

  if (typeof status === "string") {
    const normalized = status.toLowerCase();
    return (
      normalized.includes("error") ||
      normalized.includes("notfound") ||
      normalized.includes("fail") ||
      normalized === "declined"
    );
  }

  if (typeof status !== "object") {
    return false;
  }

  if ("errored" in status || "not_found" in status || "notFound" in status) {
    return true;
  }

  const kind =
    (typeof (status as { kind?: unknown }).kind === "string" &&
      (status as { kind?: string }).kind) ||
    (typeof (status as { type?: unknown }).type === "string" &&
      (status as { type?: string }).type) ||
    "";

  const normalizedKind = kind.toLowerCase();
  return (
    normalizedKind.includes("error") ||
    normalizedKind.includes("notfound") ||
    normalizedKind.includes("fail")
  );
}

function determineCommandStatus(
  itemStatus: unknown,
  exitCode: number | null | undefined,
): "running" | "completed" | "failed" {
  if (itemStatus === "inProgress" || itemStatus === undefined) {
    return "running";
  }
  if (itemStatus === "failed" || itemStatus === "declined") {
    return "failed";
  }
  if (typeof exitCode === "number" && exitCode !== 0) {
    return "failed";
  }
  return "completed";
}

function determineCollabEntryStatus(params: {
  itemStatus?: unknown;
  agentsStates?: Record<string, CodexCollabToolAgentState>;
  fallback?: "running" | "completed" | "failed";
}): "running" | "completed" | "failed" {
  const { itemStatus, agentsStates, fallback = "running" } = params;
  if (isFailedAgentStatus(itemStatus)) {
    return "failed";
  }
  if (
    agentsStates &&
    Object.values(agentsStates).some((state) =>
      isFailedAgentStatus(state.status),
    )
  ) {
    return "failed";
  }
  if (itemStatus === "completed") {
    return "completed";
  }
  return fallback;
}

function determineTodoEntryStatus(
  providedStatus: unknown,
  items: CodexTodoItem[],
  fallbackStatus?: "running" | "completed",
): "running" | "completed" {
  if (items.length > 0 && items.every((item) => item.completed)) {
    return "completed";
  }
  if (providedStatus === "completed") {
    return "completed";
  }
  if (providedStatus === "inProgress" || providedStatus === "running") {
    return "running";
  }
  return fallbackStatus ?? "running";
}

function extractReasoningText(item: CodexItem): string {
  const summary = item.summary;
  if (typeof summary === "string") {
    return summary;
  }
  if (Array.isArray(summary)) {
    return summary
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  const content = item.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function commandString(item: CodexItem): string {
  const cmd = item.command;
  if (Array.isArray(cmd)) {
    return cmd
      .filter((part): part is string => typeof part === "string")
      .join(" ");
  }
  return typeof cmd === "string" ? cmd : "";
}

function handleItemStarted(
  item: CodexItem,
  index: number,
  ctx: BuildContext,
): void {
  const itemId =
    typeof item.id === "string" ? item.id : `${item.type ?? "item"}-${index}`;

  switch (item.type) {
    case "agentMessage": {
      const text = typeof item.text === "string" ? item.text : "";
      const entry: MessageEntry = {
        id: itemId,
        kind: "message",
        role: "assistant",
        text,
      };
      ctx.entries.push(entry);
      ctx.messageMap.set(itemId, entry);
      return;
    }

    case "userMessage":
      // User input is rendered by the chat UI itself; skip to avoid duplicating
      // it inside the agent logs.
      return;

    case "reasoning": {
      const entry: ReasoningEntry = {
        id: itemId,
        kind: "reasoning",
        text: extractReasoningText(item),
      };
      ctx.entries.push(entry);
      ctx.reasoningMap.set(itemId, entry);
      return;
    }

    case "commandExecution": {
      const entry: CommandEntry = {
        id: itemId,
        kind: "command",
        command: commandString(item),
        output:
          typeof item.aggregatedOutput === "string" ? item.aggregatedOutput : "",
        exitCode:
          typeof item.exitCode === "number" ? (item.exitCode as number) : null,
        status: determineCommandStatus(
          item.status,
          typeof item.exitCode === "number" ? (item.exitCode as number) : null,
        ),
      };
      ctx.entries.push(entry);
      ctx.toolMap.set(itemId, entry);
      return;
    }

    case "webSearch": {
      const query =
        typeof item.query === "string" ? (item.query as string).trim() : "";
      ctx.entries.push({
        id: `${itemId}-web-search-started-${index}`,
        kind: "status",
        label: "Web search",
        detail: query ? `Searching: ${query}` : "Searching…",
      });
      return;
    }

    case "mcpToolCall":
    case "dynamicToolCall": {
      const entry: McpToolEntry = {
        id: itemId,
        kind: "mcp_tool_call",
        server: typeof item.server === "string" ? item.server : undefined,
        tool: typeof item.tool === "string" ? item.tool : undefined,
        arguments: normalizeArguments(item.arguments),
        status: "running",
        result: (item.result as CodexMcpToolResult | undefined) || null,
        error: item.error,
      };
      ctx.entries.push(entry);
      ctx.toolMap.set(itemId, entry);
      return;
    }

    case "collabToolCall": {
      const receiverThreadIds = normalizeStringArray(item.receiverThreadIds);
      const agentsStates = normalizeAgentStates(item.agentsStates);
      const entry: CollabToolEntry = {
        id: itemId,
        kind: "collab_tool_call",
        tool: typeof item.tool === "string" ? item.tool : undefined,
        prompt: typeof item.prompt === "string" ? item.prompt : null,
        senderThreadId:
          typeof item.senderThreadId === "string"
            ? item.senderThreadId
            : undefined,
        receiverThreadIds:
          receiverThreadIds.length > 0
            ? receiverThreadIds
            : Object.keys(agentsStates || {}),
        agentsStates,
        status: determineCollabEntryStatus({
          itemStatus: item.status,
          agentsStates,
          fallback: "running",
        }),
      };
      ctx.entries.push(entry);
      ctx.toolMap.set(itemId, entry);
      return;
    }

    case "todoList": {
      const items = (item.items as CodexTodoItem[] | undefined) || [];
      const entry: TodosEntry = {
        id: `${itemId}-started-${index}`,
        kind: "todos",
        items,
        status: determineTodoEntryStatus(item.status, items, "running"),
      };
      ctx.entries.push(entry);
      ctx.todoMap.set(itemId, entry);
      return;
    }

    case "fileChange": {
      // The final list of changes may only be available on completion; render
      // status on start and let completion replace it with the full diff.
      ctx.entries.push({
        id: `${itemId}-started-${index}`,
        kind: "status",
        label: "Preparing file changes",
        detail:
          typeof item.status === "string" ? String(item.status) : undefined,
      });
      return;
    }

    default:
      return;
  }
}

function handleItemCompleted(
  item: CodexItem,
  index: number,
  ctx: BuildContext,
): void {
  const itemId =
    typeof item.id === "string" ? item.id : `${item.type ?? "item"}-${index}`;

  switch (item.type) {
    case "agentMessage": {
      const existing = ctx.messageMap.get(itemId);
      const text = typeof item.text === "string" ? item.text : existing?.text;
      if (existing) {
        existing.text = text ?? existing.text;
      } else if (text) {
        const entry: MessageEntry = {
          id: itemId,
          kind: "message",
          role: "assistant",
          text,
        };
        ctx.entries.push(entry);
        ctx.messageMap.set(itemId, entry);
      }
      return;
    }

    case "userMessage":
      return;

    case "reasoning": {
      const existing = ctx.reasoningMap.get(itemId);
      const text = extractReasoningText(item);
      if (existing) {
        if (text) existing.text = text;
      } else if (text) {
        const entry: ReasoningEntry = {
          id: itemId,
          kind: "reasoning",
          text,
        };
        ctx.entries.push(entry);
        ctx.reasoningMap.set(itemId, entry);
      }
      return;
    }

    case "commandExecution": {
      const exitCode =
        typeof item.exitCode === "number" ? (item.exitCode as number) : null;
      const status = determineCommandStatus(item.status, exitCode);
      const output =
        typeof item.aggregatedOutput === "string"
          ? (item.aggregatedOutput as string)
          : undefined;
      const existing = ctx.toolMap.get(itemId);
      if (existing && existing.kind === "command") {
        existing.status = status;
        existing.exitCode = exitCode;
        if (output !== undefined) {
          existing.output = output;
        }
        const cmd = commandString(item);
        if (cmd) existing.command = cmd;
      } else {
        ctx.entries.push({
          id: itemId,
          kind: "command",
          command: commandString(item),
          output: output ?? "",
          exitCode,
          status,
        });
      }
      return;
    }

    case "webSearch": {
      const query =
        typeof item.query === "string" ? (item.query as string).trim() : "";
      ctx.entries.push({
        id: `${itemId}-web-search-completed-${index}`,
        kind: "status",
        label: "Web search",
        detail: query ? `Completed: ${query}` : "Completed",
      });
      return;
    }

    case "mcpToolCall":
    case "dynamicToolCall": {
      const args = normalizeArguments(item.arguments);
      const result = (item.result as CodexMcpToolResult | undefined) || null;
      const hasError = item.error !== undefined && item.error !== null;
      const statusValue = item.status;
      const status: "completed" | "failed" =
        hasError || statusValue === "failed" || statusValue === "declined"
          ? "failed"
          : "completed";

      const existing = ctx.toolMap.get(itemId);
      if (existing && existing.kind === "mcp_tool_call") {
        existing.status = status;
        existing.result = result;
        existing.arguments = args ?? existing.arguments ?? null;
        existing.error = item.error;
        existing.server =
          typeof item.server === "string" ? item.server : existing.server;
        existing.tool =
          typeof item.tool === "string" ? item.tool : existing.tool;
      } else {
        ctx.entries.push({
          id: itemId,
          kind: "mcp_tool_call",
          server: typeof item.server === "string" ? item.server : undefined,
          tool: typeof item.tool === "string" ? item.tool : undefined,
          arguments: args,
          status,
          result,
          error: item.error,
        });
      }
      return;
    }

    case "collabToolCall": {
      const agentsStates = normalizeAgentStates(item.agentsStates);
      const receiverThreadIds = normalizeStringArray(item.receiverThreadIds);
      const status = determineCollabEntryStatus({
        itemStatus: item.status,
        agentsStates,
        fallback: "completed",
      });

      const existing = ctx.toolMap.get(itemId);
      if (existing && existing.kind === "collab_tool_call") {
        existing.status = status;
        existing.tool =
          typeof item.tool === "string" ? item.tool : existing.tool;
        existing.prompt =
          typeof item.prompt === "string" ? item.prompt : existing.prompt;
        existing.senderThreadId =
          typeof item.senderThreadId === "string"
            ? item.senderThreadId
            : existing.senderThreadId;
        existing.receiverThreadIds =
          receiverThreadIds.length > 0
            ? receiverThreadIds
            : Object.keys(agentsStates || existing.agentsStates || {});
        existing.agentsStates = agentsStates ?? existing.agentsStates;
      } else {
        ctx.entries.push({
          id: itemId,
          kind: "collab_tool_call",
          tool: typeof item.tool === "string" ? item.tool : undefined,
          prompt: typeof item.prompt === "string" ? item.prompt : null,
          senderThreadId:
            typeof item.senderThreadId === "string"
              ? item.senderThreadId
              : undefined,
          receiverThreadIds:
            receiverThreadIds.length > 0
              ? receiverThreadIds
              : Object.keys(agentsStates || {}),
          agentsStates,
          status,
        });
      }
      return;
    }

    case "todoList": {
      const items = (item.items as CodexTodoItem[] | undefined) || [];
      const previous = ctx.todoMap.get(itemId);
      const todoEntry: TodosEntry = {
        id: `${itemId}-completed-${index}`,
        kind: "todos",
        items,
        status: determineTodoEntryStatus(
          item.status ?? "completed",
          items,
          previous?.status,
        ),
      };
      ctx.entries.push(todoEntry);
      ctx.todoMap.set(itemId, todoEntry);
      return;
    }

    case "fileChange": {
      const changes = (item.changes as CodexFileChange[] | undefined) || [];
      ctx.entries.push({
        id: itemId,
        kind: "file_change",
        changes,
      });
      return;
    }

    default:
      return;
  }
}

function handleItemUpdated(
  item: CodexItem,
  index: number,
  ctx: BuildContext,
): void {
  const itemId =
    typeof item.id === "string" ? item.id : `${item.type ?? "item"}-${index}`;

  // The SDK's ProviderLogAssembler folds delta notifications
  // (`item/agentMessage/delta`, `item/reasoning/*Delta`,
  // `item/commandExecution/outputDelta`) into synthesized `item/updated`
  // snapshots whose `item` field carries the cumulative text/output. Mirror
  // the per-type handlers below so streamed content keeps growing in the
  // UI between `item/started` and `item/completed`.
  switch (item.type) {
    case "agentMessage": {
      const text = typeof item.text === "string" ? item.text : "";
      const existing = ctx.messageMap.get(itemId);
      if (existing) {
        existing.text = text;
      } else if (text) {
        const entry: MessageEntry = {
          id: itemId,
          kind: "message",
          role: "assistant",
          text,
        };
        ctx.entries.push(entry);
        ctx.messageMap.set(itemId, entry);
      }
      return;
    }

    case "reasoning": {
      const text = extractReasoningText(item);
      const existing = ctx.reasoningMap.get(itemId);
      if (existing) {
        if (text) existing.text = text;
      } else if (text) {
        const entry: ReasoningEntry = {
          id: itemId,
          kind: "reasoning",
          text,
        };
        ctx.entries.push(entry);
        ctx.reasoningMap.set(itemId, entry);
      }
      return;
    }

    case "commandExecution": {
      const existing = ctx.toolMap.get(itemId);
      if (existing && existing.kind === "command") {
        if (typeof item.aggregatedOutput === "string") {
          existing.output = item.aggregatedOutput;
        }
      }
      return;
    }

    case "todoList": {
      const items = (item.items as CodexTodoItem[] | undefined) || [];
      const previous = ctx.todoMap.get(itemId);
      const nextStatus = determineTodoEntryStatus(
        item.status,
        items,
        previous?.status,
      );
      const entry: TodosEntry = {
        id: `${itemId}-updated-${index}`,
        kind: "todos",
        items,
        status: nextStatus,
      };
      ctx.entries.push(entry);
      ctx.todoMap.set(itemId, entry);
      return;
    }

    default:
      return;
  }
}

function handleAgentMessageDelta(
  params: Record<string, unknown>,
  ctx: BuildContext,
): void {
  const itemId =
    typeof params.itemId === "string" ? (params.itemId as string) : undefined;
  const delta =
    typeof params.delta === "string" ? (params.delta as string) : "";
  if (!itemId || !delta) return;

  const existing = ctx.messageMap.get(itemId);
  if (existing) {
    existing.text = (existing.text ?? "") + delta;
    return;
  }

  // No started event yet - create a lightweight entry so deltas still render.
  const entry: MessageEntry = {
    id: itemId,
    kind: "message",
    role: "assistant",
    text: delta,
  };
  ctx.entries.push(entry);
  ctx.messageMap.set(itemId, entry);
}

function handleReasoningDelta(
  params: Record<string, unknown>,
  ctx: BuildContext,
): void {
  const itemId =
    typeof params.itemId === "string" ? (params.itemId as string) : undefined;
  const delta =
    typeof params.delta === "string"
      ? (params.delta as string)
      : typeof params.text === "string"
        ? (params.text as string)
        : "";
  if (!itemId || !delta) return;

  const existing = ctx.reasoningMap.get(itemId);
  if (existing) {
    existing.text = (existing.text ?? "") + delta;
    return;
  }

  const entry: ReasoningEntry = {
    id: itemId,
    kind: "reasoning",
    text: delta,
  };
  ctx.entries.push(entry);
  ctx.reasoningMap.set(itemId, entry);
}

function handleCommandOutputDelta(
  params: Record<string, unknown>,
  ctx: BuildContext,
): void {
  const itemId =
    typeof params.itemId === "string" ? (params.itemId as string) : undefined;
  const chunk =
    typeof params.chunk === "string"
      ? (params.chunk as string)
      : typeof params.delta === "string"
        ? (params.delta as string)
        : typeof params.text === "string"
          ? (params.text as string)
          : "";
  if (!itemId || !chunk) return;

  const existing = ctx.toolMap.get(itemId);
  if (existing && existing.kind === "command") {
    existing.output = (existing.output ?? "") + chunk;
  }
}

function handleError(
  params: Record<string, unknown>,
  ctx: BuildContext,
  index: number,
): void {
  const error = params.error as
    | { message?: string; additionalDetails?: string | null }
    | undefined;
  if (!error) return;

  const willRetry = params.willRetry === true;
  if (willRetry) {
    return;
  }

  ctx.entries.push({
    id: `error-${index}`,
    kind: "status",
    label: "Codex error",
    detail: error.message ?? error.additionalDetails ?? "Unknown error",
    tone: "error",
  });
}

interface BuildContext {
  entries: CodexDisplayEntry[];
  messageMap: Map<string, MessageEntry>;
  reasoningMap: Map<string, ReasoningEntry>;
  toolMap: Map<string, ToolEntry>;
  todoMap: Map<string, TodosEntry>;
}

export function buildDisplayEntries(events: CodexEvent[]): CodexDisplayEntry[] {
  const ctx: BuildContext = {
    entries: [],
    messageMap: new Map(),
    reasoningMap: new Map(),
    toolMap: new Map(),
    todoMap: new Map(),
  };

  events.forEach((event, index) => {
    const method = typeof event?.method === "string" ? event.method : undefined;
    if (!method) {
      // Non-notification payload (e.g. the result of `thread/start`). Skip.
      return;
    }

    if (IGNORED_METHODS.has(method)) {
      return;
    }

    const params = (event.params as Record<string, unknown> | undefined) ?? {};

    if (method === "item/started") {
      const item = params.item as CodexItem | undefined;
      if (item) handleItemStarted(item, index, ctx);
      return;
    }

    if (method === "item/updated") {
      const item = params.item as CodexItem | undefined;
      if (item) handleItemUpdated(item, index, ctx);
      return;
    }

    if (method === "item/completed") {
      const item = params.item as CodexItem | undefined;
      if (item) handleItemCompleted(item, index, ctx);
      return;
    }

    if (method === "item/agentMessage/delta") {
      handleAgentMessageDelta(params, ctx);
      return;
    }

    if (
      method === "item/reasoning/summaryTextDelta" ||
      method === "item/reasoning/textDelta"
    ) {
      handleReasoningDelta(params, ctx);
      return;
    }

    if (method === "item/reasoning/summaryPartAdded") {
      // Section boundary — no-op, we concatenate summary sections.
      return;
    }

    if (method === "item/commandExecution/outputDelta") {
      handleCommandOutputDelta(params, ctx);
      return;
    }

    if (method === "item/fileChange/outputDelta") {
      // We render the final fileChange item on completion; streaming diffs
      // aren't visualized today. Skip to avoid raw event noise.
      return;
    }

    if (method === "error") {
      handleError(params, ctx, index);
      return;
    }

    // Unknown event: surface it as a collapsible raw entry for debugging.
    ctx.entries.push({
      id: `raw-${index}`,
      kind: "raw",
      event,
    });
  });

  return ctx.entries;
}
