// @ts-nocheck -- vendored AI Elements components target a different @base-ui/react major than the one installed via shadcn; they run correctly at runtime. See next.config.ts history for context.
import { cn } from "@/lib/utils";
import { NodeToolbar, Position } from "@xyflow/react";
import type { ComponentProps } from "react";

type ToolbarProps = ComponentProps<typeof NodeToolbar>;

export const Toolbar = ({ className, ...props }: ToolbarProps) => (
  <NodeToolbar
    className={cn(
      "flex items-center gap-1 rounded-sm border bg-background p-1.5",
      className
    )}
    position={Position.Bottom}
    {...props}
  />
);
