import type React from "react";

export type AgentTodoStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface AgentTodo {
  id: string;
  content: string;
  status: AgentTodoStatus;
}

export type AgentToolInput = Record<string, unknown>;

export interface AgentToolCall<TInput extends AgentToolInput = AgentToolInput> {
  id: string;
  name: string;
  input: TInput;
  result?: unknown;
  hasResult: boolean;
  parentId?: string | null;
  children?: AgentToolCall<TInput>[];
}

export type AgentToolIconMap = Record<string, React.ElementType>;

export interface AgentToolRendererConfig<
  TTool extends AgentToolCall = AgentToolCall,
> {
  iconMap?: AgentToolIconMap;
  defaultIcon?: React.ElementType;
  formatDescription?: (tool: TTool) => string;
  renderResult?: (tool: TTool) => React.ReactNode;
  customToolRenderers?: Record<
    string,
    (ctx: AgentToolRendererContext<TTool>) => React.ReactNode | null | undefined
  >;
  onToolClick?: (tool: TTool) => boolean | void;
}

export interface AgentToolRendererContext<
  TTool extends AgentToolCall = AgentToolCall,
> {
  tool: TTool;
  isChild: boolean;
  isRunning: boolean;
  isExpanded: boolean;
  expandedTools: Set<string>;
  onToggle: (id: string) => void;
  toggleSelf: () => void;
  config: AgentToolRendererConfig<TTool>;
}
