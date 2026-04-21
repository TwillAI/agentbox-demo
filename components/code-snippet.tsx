"use client";

import * as React from "react";
import type { BundledLanguage } from "shiki";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ai-elements/code-block";
import { cn } from "@/lib/utils";

interface CodeSnippetProps {
  children?: string | null;
  language?: string;
  title?: string;
  className?: string;
  maxHeight?: string;
  showLineNumbers?: boolean;
}

export const CodeSnippet: React.FC<CodeSnippetProps> = ({
  children,
  language,
  title,
  className,
  maxHeight = "320px",
  showLineNumbers = false,
}) => {
  const code = (children ?? "").toString();
  const lang = (language ?? "text") as BundledLanguage;

  return (
    <CodeBlock
      code={code}
      language={lang}
      showLineNumbers={showLineNumbers}
      className={cn("text-xs", className)}
      style={{ maxHeight, overflow: "auto" }}
    >
      {title ? (
        <CodeBlockHeader>
          <CodeBlockTitle>
            <CodeBlockFilename>{title}</CodeBlockFilename>
          </CodeBlockTitle>
          <CodeBlockActions>
            <CodeBlockCopyButton />
          </CodeBlockActions>
        </CodeBlockHeader>
      ) : (
        <div className="pointer-events-none absolute top-1 right-1 z-10 opacity-0 transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto">
          <CodeBlockCopyButton className="h-7 w-7" />
        </div>
      )}
    </CodeBlock>
  );
};

export default CodeSnippet;
