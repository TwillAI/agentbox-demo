import React from "react";
import {
  ChevronDown as CaretDown,
  ChevronRight as CaretRight,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type {
  AgentToolCall,
  AgentToolRendererConfig,
  AgentToolRendererContext,
} from "../types";

interface AgentToolCallTreeProps {
  tool: AgentToolCall;
  isChild?: boolean;
  isRunning?: boolean;
  isExpanded: boolean;
  expandedTools: Set<string>;
  onToggle: (id: string) => void;
  config?: AgentToolRendererConfig;
}

export function AgentToolCallTree({
  tool,
  isChild = false,
  isRunning = false,
  isExpanded,
  expandedTools,
  onToggle,
  config,
}: AgentToolCallTreeProps) {
  const iconMap = config?.iconMap;
  const Icon = (iconMap?.[tool.name] ||
    iconMap?.default ||
    config?.defaultIcon ||
    (() => null)) as React.ComponentType<{ className?: string }>;
  const description =
    config?.formatDescription?.(tool) || tool.name || "Tool Call";

  const toggleSelf = () => onToggle(tool.id);
  const handleClick = () => {
    if (config?.onToolClick?.(tool)) {
      return;
    }
    toggleSelf();
  };

  const context: AgentToolRendererContext = {
    tool,
    isChild,
    isRunning,
    isExpanded,
    expandedTools,
    onToggle,
    toggleSelf,
    config: config || {},
  };

  const customRenderer = config?.customToolRenderers?.[tool.name];
  if (customRenderer) {
    const rendered = customRenderer(context);
    if (rendered) {
      return <>{rendered}</>;
    }
  }

  const hasChildren = !!tool.children?.length;
  const isRunningTool = isRunning && !tool.hasResult;

  const resultContent =
    config?.renderResult?.(tool) ?? defaultRenderResult(tool);

  const hasResult = tool.result !== undefined && tool.result !== null;
  const hasInput = tool.input && Object.keys(tool.input).length > 0;

  return (
    <div className={`py-1 ${isChild ? "ml-5.5" : ""}`}>
      <div
        className="group/tool flex cursor-pointer items-center gap-2"
        onClick={handleClick}
      >
        <div>
          <Icon className="text-muted-foreground h-3.5 w-3.5" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isRunningTool ? (
            <Shimmer as="span" className="truncate text-xs font-medium">
              {description}
            </Shimmer>
          ) : (
            <span className="text-muted-foreground group-hover/tool:text-foreground truncate text-xs font-medium transition-colors">
              {description}
            </span>
          )}
          {isExpanded ? (
            <CaretDown className="text-muted-foreground !size-2.5 flex-shrink-0" />
          ) : (
            <CaretRight className="text-muted-foreground !size-2.5 flex-shrink-0 opacity-0 transition-opacity group-hover/tool:opacity-100" />
          )}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {hasResult && resultContent && (
              <div className="text-muted-foreground mt-2 ml-5.5 text-xs">
                {resultContent}
              </div>
            )}

            {!hasResult && !hasChildren && hasInput && (
              <div className="text-muted-foreground mt-2 ml-5.5 text-xs">
                <pre className="font-mono whitespace-pre-wrap">
                  {JSON.stringify(tool.input, null, 2)}
                </pre>
              </div>
            )}

            {hasChildren && (
              <div className="mt-1">
                {tool.children!.map((child) => (
                  <AgentToolCallTree
                    key={child.id}
                    tool={child}
                    isChild
                    isRunning={isRunningTool}
                    isExpanded={expandedTools.has(child.id)}
                    expandedTools={expandedTools}
                    onToggle={onToggle}
                    config={config}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const defaultRenderResult = (tool: AgentToolCall) => {
  return (
    <pre className="font-mono whitespace-pre-wrap">
      {typeof tool.result === "string"
        ? tool.result
        : JSON.stringify(tool.result, null, 2)}
    </pre>
  );
};
