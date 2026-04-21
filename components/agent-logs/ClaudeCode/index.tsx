import React, { useMemo, useState, useCallback, useRef } from "react";
import {
  Brain,
  ChevronDown as CaretDown,
  ChevronRight as CaretRight,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { CodeSnippet } from "@/components/code-snippet";
import { CodeDiffSnippet } from "@/components/code-diff-snippet";
import { Markdown } from "@/components/markdown";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { AgentToolCallTree } from "../shared/AgentToolCallTree";
import { AgentTodoList } from "../shared/AgentTodoList";
import { AgentTerminalBlock } from "../shared/AgentTerminalBlock";
import {
  defaultToolIconMap,
  getLanguageFromPath,
  formatToolDescription,
} from "../shared/tooling";
import {
  Base64ImageBlock,
  getBase64ImageSrc,
  isBase64ImageBlock,
} from "../shared/image-utils";
import type { AgentToolCall, AgentToolRendererConfig } from "../types";
import type { ClaudeCodeEvent, Todo, ToolInput } from "../types/claude-code";
import { cn } from "@/lib/utils";

export type { ClaudeCodeEvent } from "../types/claude-code";
export type ToolCall = AgentToolCall<ToolInput>;

interface Props {
  showLast?: boolean;
  events?: Array<ClaudeCodeEvent>;
  isRunning?: boolean;
  className?: string;
}

/**
 * Component that displays already-parsed Claude Code logs
 */
export const ClaudeEventsDisplay: React.FC<Props> = ({
  events,
  isRunning = false,
  showLast = false,
  className,
}) => {
  // Build tool calls map with results and parent-child relationships
  const toolCalls = useMemo(() => {
    const calls = new Map<string, ToolCall>();

    const logs = events || [];

    // First pass: collect all tool calls with parent info
    for (const log of logs) {
      if (log.type === "assistant") {
        for (const content of log.message.content) {
          if (content.type === "tool_use" && content.id) {
            calls.set(content.id, {
              id: content.id,
              name: content.name || "Unknown",
              input: content.input || {},
              hasResult: false,
              parentId: log.parent_tool_use_id || null,
              children: [],
            });
          }
        }
      }
    }

    // Second pass: match results with tool calls
    for (const log of logs) {
      if (log.type === "user") {
        for (const content of log.message.content) {
          if (content.type === "tool_result" && content.tool_use_id) {
            const call = calls.get(content.tool_use_id);
            if (call) {
              call.result = content.content;
              call.hasResult = true;
            }
          }
        }
      }
    }

    // Third pass: build parent-child relationships
    calls.forEach((call) => {
      if (!call.children) {
        call.children = [];
      }
      if (call.parentId) {
        const parent = calls.get(call.parentId);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(call);
        }
      }
    });

    // Fourth pass: ensure Task tools include input/output as virtual children
    calls.forEach((call) => {
      if (call.name?.toLowerCase() !== "task") {
        return;
      }

      const existingChildren = call.children ? [...call.children] : [];
      const syntheticChildren: ToolCall[] = [];

      const inputId = `${call.id}-input`;
      const taskInput: ToolCall = {
        id: inputId,
        name: "TaskInput",
        input: call.input,
        hasResult: true,
        result: call.input,
        parentId: call.id,
        children: [],
      };
      calls.set(inputId, taskInput);
      syntheticChildren.push(taskInput);

      syntheticChildren.push(...existingChildren);

      if (call.result !== undefined && call.result !== null) {
        const outputId = `${call.id}-output`;
        const taskOutput: ToolCall = {
          id: outputId,
          name: "TaskOutput",
          input: {},
          hasResult: true,
          result: call.result,
          parentId: call.id,
          children: [],
        };
        calls.set(outputId, taskOutput);
        syntheticChildren.push(taskOutput);
      }

      call.children = syntheticChildren;
      // Avoid rendering raw Task result blob at the parent level
      call.result = undefined;
    });

    return calls;
  }, [events]);

  // Track tools the user has manually collapsed so we don't re-expand them
  const manuallyCollapsedRef = useRef<Set<string>>(new Set());

  // Initialize expanded tools with Task tools auto-expanded
  const [expandedTools, setExpandedTools] = useState<Set<string>>(() => {
    const initialExpanded = new Set<string>();
    toolCalls.forEach((tool, toolId) => {
      // Auto-expand Task tools (case-insensitive check)
      if (tool.name === "Task" || tool.name === "task") {
        initialExpanded.add(toolId);
      }
    });
    return initialExpanded;
  });

  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(
    () => new Set(),
  );

  // Auto-expand new Task tools when they appear (but not ones the user collapsed)
  React.useEffect(() => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      let hasChanges = false;

      toolCalls.forEach((tool, toolId) => {
        if (
          (tool.name === "Task" || tool.name === "task") &&
          !next.has(toolId) &&
          !manuallyCollapsedRef.current.has(toolId)
        ) {
          next.add(toolId);
          hasChanges = true;
        }
      });

      return hasChanges ? next : prev;
    });
  }, [toolCalls]);

  // Group entries for display (excluding sub-agent tools)
  const groupedEntries = useMemo(() => {
    const groups: Array<{
      type: "text" | "thinking" | "tools";
      entries: ClaudeCodeEvent[];
      toolIds?: string[];
    }> = [];

    let currentToolGroup: ClaudeCodeEvent[] = [];
    let currentToolIds: string[] = [];

    // Filter out "result" type entries first
    const logs = (events || []).filter((log) => log.type !== "result");

    const flushToolGroup = () => {
      if (currentToolGroup.length === 0) return;
      groups.push({
        type: "tools",
        entries: currentToolGroup,
        toolIds: currentToolIds,
      });
      currentToolGroup = [];
      currentToolIds = [];
    };

    for (const log of logs) {
      if (log.type !== "assistant") continue;

      const contentBlocks = Array.isArray(log.message?.content)
        ? log.message.content
        : [];

      for (const block of contentBlocks) {
        if (!block) continue;

        if (block.type === "tool_use") {
          // Only add to group if it's not a sub-agent tool (no parent)
          if (!log.parent_tool_use_id) {
            currentToolGroup.push({
              ...log,
              message: { ...log.message, content: [block] },
            });
            if (block.id) {
              currentToolIds.push(block.id);
            }
          }
          continue;
        }

        if (block.type === "thinking") {
          flushToolGroup();
          groups.push({
            type: "thinking",
            entries: [
              { ...log, message: { ...log.message, content: [block] } },
            ],
          });
          continue;
        }

        const textContent: string =
          typeof block.text === "string"
            ? block.text
            : typeof block.content === "string"
              ? (block.content as string)
              : "";

        if (textContent) {
          flushToolGroup();
          groups.push({
            type: "text",
            entries: [
              { ...log, message: { ...log.message, content: [block] } },
            ],
          });
        }
      }
    }

    // Add any remaining tool group
    flushToolGroup();

    return groups;
  }, [events]);

  const toggleTool = useCallback((toolId: string) => {
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

  const toggleThinking = useCallback((thinkingId: string) => {
    setExpandedThinking((prev) => {
      const next = new Set(prev);
      if (next.has(thinkingId)) {
        next.delete(thinkingId);
      } else {
        next.add(thinkingId);
      }
      return next;
    });
  }, []);

  // Filter to show only the last entry if showLast is true
  const entriesToDisplay = useMemo(() => {
    if (!showLast) return groupedEntries;

    // Find the last non-empty group
    for (let i = groupedEntries.length - 1; i >= 0; i--) {
      const group = groupedEntries[i];
      // Check if this group has meaningful content
      if (group.type === "text" && group.entries?.[0]) {
        const content = group.entries[0].message.content[0];
        if (content?.text || content?.content) {
          return [group];
        }
      } else if (group.type === "thinking" && group.entries?.[0]) {
        const content = group.entries[0].message.content[0] as {
          thinking?: string;
        };
        if (typeof content?.thinking === "string" && content.thinking.trim()) {
          return [group];
        }
      } else if (
        group.type === "tools" &&
        group.toolIds &&
        group.toolIds.length > 0
      ) {
        return [group];
      }
    }

    return [];
  }, [groupedEntries, showLast]);

  const renderToolResult = useCallback((tool: ToolCall) => {
    if (tool.result === "No files found") {
      return <span className="italic">No results found</span>;
    }

    if (tool.name === "Bash" && tool.input?.command !== undefined) {
      const command = String(tool.input.command ?? "");
      const output =
        typeof tool.result === "string"
          ? tool.result
          : tool.result !== undefined && tool.result !== null
            ? JSON.stringify(tool.result, null, 2)
            : "";

      return <AgentTerminalBlock command={command} output={output} />;
    }

    if (tool.name === "TaskInput") {
      const taskInput = tool.result as { prompt?: string };
      if (taskInput?.prompt) {
        return (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <Markdown>{taskInput.prompt}</Markdown>
          </div>
        );
      }
      return null;
    }

    if (tool.name === "TaskOutput") {
      let resultText = "";
      if (typeof tool.result === "string") {
        resultText = tool.result;
      } else if (Array.isArray(tool.result)) {
        resultText = tool.result
          .map((block: unknown) => {
            if (typeof block === "string") return block;
            const blockObj = block as {
              type?: string;
              text?: string;
              content?: unknown;
            };
            if (blockObj?.type === "text" && blockObj?.text) {
              return blockObj.text;
            }
            if (typeof blockObj?.content === "string") {
              return blockObj.content;
            }
            return "";
          })
          .filter(Boolean)
          .join("\n");
      }

      if (resultText) {
        return (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <Markdown>{resultText}</Markdown>
          </div>
        );
      }
      return null;
    }

    const resultAny = tool.result as unknown;
    const resultArray: unknown[] = Array.isArray(resultAny)
      ? (resultAny as unknown[])
      : [];
    const imageBlocks: Base64ImageBlock[] =
      resultArray.filter(isBase64ImageBlock);

    if (imageBlocks.length > 0) {
      return (
        <div className="space-y-2">
          {imageBlocks.map((b, idx) => {
            const src = getBase64ImageSrc(b);
            if (!src) {
              return null;
            }
            return (
              <AspectRatio key={idx} ratio={16 / 9}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Image result ${idx + 1}`}
                  className="bg-muted absolute inset-0 h-full w-full rounded-md border object-contain"
                />
              </AspectRatio>
            );
          })}
        </div>
      );
    }

    if (tool.name === "Read") {
      const filePath =
        (tool.input.file_path as string) ||
        (tool.input.target_file as string) ||
        (tool.input.path as string);
      if (typeof tool.result !== "string") {
        return (
          <pre className="font-mono whitespace-pre-wrap">
            {JSON.stringify(tool.result, null, 2)}
          </pre>
        );
      }

      let contentToClean = tool.result as string;
      const systemReminderPattern =
        /<system-reminder>[\s\S]*?<\/system-reminder>/g;
      contentToClean = contentToClean.replace(systemReminderPattern, "");

      const cleanedContent = contentToClean
        .split("\n")
        .map((line) => line.replace(/^\s*\d+→/, ""))
        .join("\n")
        .trim();

      return (
        <CodeSnippet
          language={getLanguageFromPath(filePath)}
          title={filePath?.split("/").pop()}
        >
          {cleanedContent}
        </CodeSnippet>
      );
    }

    if (tool.name === "Write" || tool.name === "WriteFile") {
      const filePath =
        (tool.input.file_path as string) ||
        (tool.input.path as string) ||
        (tool.input.target_file as string);
      const content =
        (tool.input.contents as string) || (tool.input.content as string) || "";

      if (content) {
        return (
          <CodeSnippet
            language={getLanguageFromPath(filePath)}
            title={filePath?.split("/").pop()}
          >
            {content}
          </CodeSnippet>
        );
      }

      return (
        <pre className="font-mono whitespace-pre-wrap">
          {typeof tool.result === "string"
            ? tool.result
            : JSON.stringify(tool.result, null, 2)}
        </pre>
      );
    }

    if (
      (tool.name === "Edit" || tool.name === "SearchReplace") &&
      tool.input.old_string !== undefined &&
      tool.input.new_string !== undefined
    ) {
      return (
        <CodeDiffSnippet
          oldString={tool.input.old_string as string}
          newString={tool.input.new_string as string}
          filePath={tool.input.file_path as string}
          maxHeight="300px"
          showLineNumbers={false}
        />
      );
    }

    if (
      tool.name === "MultiEdit" &&
      Array.isArray(tool.input.edits) &&
      tool.input.edits.length > 0
    ) {
      const edits = tool.input.edits as Array<{
        old_string: string;
        new_string: string;
      }>;
      return (
        <div className="space-y-2">
          {edits.map((edit, idx) => (
            <CodeDiffSnippet
              key={`${tool.id}-edit-${idx}`}
              oldString={edit.old_string}
              newString={edit.new_string}
              filePath={tool.input.file_path as string}
              title={`Edit ${idx + 1} of ${edits.length}`}
              maxHeight="250px"
              showLineNumbers={false}
            />
          ))}
        </div>
      );
    }

    return (
      <pre className="font-mono whitespace-pre-wrap">
        {typeof tool.result === "string"
          ? tool.result
          : JSON.stringify(tool.result, null, 2)}
      </pre>
    );
  }, []);

  const toolRendererConfig = useMemo<AgentToolRendererConfig<ToolCall>>(
    () => ({
      iconMap: defaultToolIconMap,
      formatDescription: (tool) =>
        formatToolDescription(tool.name, tool.input as ToolInput),
      renderResult: renderToolResult,
      customToolRenderers: {
        TodoWrite: ({ tool, isChild }) => {
          if (!Array.isArray(tool.input.todos)) {
            return null;
          }
          return (
            <div className={`py-1 ${isChild ? "ml-5.5" : ""}`}>
              <AgentTodoList todos={tool.input.todos as Todo[]} />
            </div>
          );
        },
      },
      onToolClick: (tool) => {
        if (tool.id === "running-infra" && typeof window !== "undefined") {
          const previewUrl = `${window.location.pathname}/preview`;
          window.open(previewUrl, "_blank");
          return true;
        }
        return false;
      },
    }),
    [renderToolResult],
  );

  if (entriesToDisplay.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-3", className)}>
      {entriesToDisplay.map((group, groupIdx) => (
        <div key={groupIdx}>
          {group.type === "text" &&
            group.entries?.[0] &&
            (() => {
              const first = group.entries[0].message.content[0] as {
                text?: string;
                content?: unknown;
              };
              const textContent: string =
                typeof first?.text === "string"
                  ? first.text
                  : typeof first?.content === "string"
                    ? (first.content as string)
                    : "";
              // Skip messages with content exactly "(no content)"
              if (textContent === "(no content)") {
                return null;
              }
              return (
                <div className="text-sm">
                  <Markdown>{textContent}</Markdown>
                </div>
              );
            })()}

          {group.type === "thinking" &&
            group.entries?.[0] &&
            (() => {
              const entry = group.entries[0];
              const first = entry.message.content[0] as {
                thinking?: string;
              };
              const thinkingText =
                typeof first?.thinking === "string" ? first.thinking : "";
              if (!thinkingText || thinkingText === "(no content)") {
                return null;
              }

              const thinkingId = `thinking-${entry.message.id ?? "msg"}-${groupIdx}`;
              const isExpanded = expandedThinking.has(thinkingId);

              return (
                <div className="py-1">
                  <div
                    className="group/thinking flex cursor-pointer items-center gap-2"
                    onClick={() => toggleThinking(thinkingId)}
                  >
                    <div>
                      <Brain className="text-muted-foreground h-3.5 w-3.5" />
                    </div>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="text-muted-foreground group-hover/thinking:text-foreground truncate text-xs font-medium transition-colors">
                        Thinking
                      </span>
                      {isExpanded ? (
                        <CaretDown className="text-muted-foreground !size-2.5 flex-shrink-0" />
                      ) : (
                        <CaretRight className="text-muted-foreground !size-2.5 flex-shrink-0 opacity-0 transition-opacity group-hover/thinking:opacity-100" />
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
                        <div className="mt-2 ml-5.5">
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <Markdown>{thinkingText}</Markdown>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })()}

          {group.type === "tools" && (
            <div className="space-y-2">
              {group.toolIds?.map((toolId) => {
                const tool = toolCalls.get(toolId);
                if (!tool) return null;
                return (
                  <AgentToolCallTree
                    key={toolId}
                    tool={tool}
                    isRunning={isRunning}
                    isExpanded={expandedTools.has(toolId)}
                    onToggle={toggleTool}
                    expandedTools={expandedTools}
                    config={toolRendererConfig}
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
