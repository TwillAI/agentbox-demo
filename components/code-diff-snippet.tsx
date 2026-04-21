"use client";

import * as React from "react";
import { diffLines } from "diff";
import CopyButton from "@/components/copy-button";
import { cn } from "@/lib/utils";

interface CodeDiffSnippetProps {
  oldString: string;
  newString: string;
  filePath?: string;
  title?: string;
  maxHeight?: string;
  showLineNumbers?: boolean;
  className?: string;
}

export const CodeDiffSnippet: React.FC<CodeDiffSnippetProps> = ({
  oldString,
  newString,
  filePath,
  title,
  maxHeight = "300px",
  className,
}) => {
  const parts = React.useMemo(
    () => diffLines(oldString, newString),
    [oldString, newString],
  );

  const heading =
    title ??
    (filePath ? filePath.split("/").pop() : undefined) ??
    filePath ??
    "diff";

  return (
    <div
      className={cn(
        "bg-muted/40 overflow-hidden rounded-md border text-xs",
        className,
      )}
    >
      <div className="border-border/60 flex items-center justify-between border-b px-2.5 py-1.5">
        <span className="text-muted-foreground font-mono text-[10px] font-medium">
          {heading}
        </span>
        <CopyButton content={newString} className="h-6 w-6" />
      </div>
      <div
        className="overflow-auto font-mono text-[11px]"
        style={{ maxHeight }}
      >
        {parts.map((part, idx) => {
          const lines = part.value.replace(/\n$/, "").split("\n");
          const prefix = part.added ? "+" : part.removed ? "-" : " ";
          const bg = part.added
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : part.removed
              ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
              : "";
          return (
            <div key={idx}>
              {lines.map((line, i) => (
                <div
                  key={i}
                  className={cn(
                    "px-3 py-[1px] whitespace-pre-wrap",
                    bg || "text-foreground/80",
                  )}
                >
                  <span className="select-none pr-2 opacity-60">{prefix}</span>
                  {line}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CodeDiffSnippet;
