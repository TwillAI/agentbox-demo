/**
 * Raw Codex app-server event, as emitted by `codex app-server` via JSON-RPC
 * (see https://developers.openai.com/codex/app-server/).
 *
 * Each streamed notification carries a `method` (e.g. "item/started",
 * "item/completed", "item/agentMessage/delta", "turn/started", ...) plus a
 * `params` payload. Some server-to-client messages (like the result of
 * `thread/start`) do not carry a `method`; we keep the type loose so we can
 * accept them too and ignore them at the display layer.
 */
export interface CodexEvent {
  method?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

export type CodexItemType =
  | "agentMessage"
  | "userMessage"
  | "reasoning"
  | "commandExecution"
  | "fileChange"
  | "mcpToolCall"
  | "dynamicToolCall"
  | "webSearch"
  | "todoList"
  | "collabToolCall"
  | "contextCompaction"
  | "enteredReviewMode"
  | "exitedReviewMode"
  | (string & {});

export interface CodexItem {
  id?: string;
  type?: CodexItemType;
  [key: string]: unknown;
}
