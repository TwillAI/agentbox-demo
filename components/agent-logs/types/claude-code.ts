export interface ToolUseContent {
  type: "tool_use";
  name: string;
  input?: ToolInput;
}

export interface AssistantLogEntry {
  type: "assistant";
  message?: {
    content?: ToolUseContent[];
  };
}

export type ToolInput = {
  pattern?: string;
  path?: string;
  target_file?: string;
  file_path?: string;
  directory?: string;
  target_directory?: string;
  command?: string;
  query?: string;
  todos?: Todo[];
  old_string?: string;
  new_string?: string;
  edits?: Array<{ old_string: string; new_string: string }>;
  contents?: string;
  content?: string;
  description?: string;
  prompt?: string;
  subagent_type?: string;
  [key: string]: unknown;
};

export type Todo = {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
};

export interface ClaudeCodeEvent {
  type: "assistant" | "user" | "result";
  parent_tool_use_id?: string | null;
  message: {
    id?: string;
    content: Array<{
      type: "tool_use" | "tool_result" | "text" | "thinking";
      id?: string;
      tool_use_id?: string;
      name?: string;
      input?: ToolInput;
      content?: unknown;
      text?: string;
      thinking?: string;
      signature?: string;
    }>;
  };
}
