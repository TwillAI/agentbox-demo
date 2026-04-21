"use client";

import * as React from "react";
import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ButtonSize = React.ComponentProps<typeof Button>["size"];
type ButtonVariant = React.ComponentProps<typeof Button>["variant"];

interface Props {
  content: string | Record<string, unknown> | (() => string);
  className?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
  label?: string;
}

const CopyButton = ({
  content,
  className,
  size = "icon",
  variant = "ghost",
  label,
}: Props) => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      const text =
        typeof content === "function"
          ? content()
          : typeof content === "object"
            ? JSON.stringify(content, null, 2)
            : String(content);

      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const Icon = copied ? (
    <CheckIcon className="h-4 w-4" />
  ) : (
    <CopyIcon className="h-4 w-4" />
  );

  if (label) {
    return (
      <Button
        type="button"
        onClick={copyToClipboard}
        variant={variant}
        size={size === "icon" ? "sm" : size}
        className={cn("gap-1.5", className)}
      >
        {Icon}
        {copied ? "Copied" : label}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      onClick={copyToClipboard}
      variant={variant}
      size="icon"
      className={cn("h-7 w-7", className)}
      aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
    >
      {Icon}
    </Button>
  );
};

export default CopyButton;
