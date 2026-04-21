"use client";

import * as React from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import { cn } from "@/lib/utils";

interface MarkdownProps {
  children?: string | null;
  className?: string;
  textSize?: "sm" | "base";
}

export const Markdown: React.FC<MarkdownProps> = ({
  children,
  className,
  textSize,
}) => {
  if (!children) return null;
  return (
    <MessageResponse
      className={cn(
        textSize === "base" ? "text-sm" : "text-sm",
        "leading-relaxed",
        className,
      )}
    >
      {children}
    </MessageResponse>
  );
};

export default Markdown;
