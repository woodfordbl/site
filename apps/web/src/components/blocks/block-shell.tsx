import type { ReactNode } from "react";

import { blockIndentStyle } from "@/lib/blocks/block-indent.ts";
import { cn } from "@/lib/utils.ts";

interface BlockShellProps {
  children: ReactNode;
  className?: string;
  indent?: number;
  label?: string;
  spacingClassName?: string;
}

export function BlockShell({
  children,
  className,
  label,
  indent = 0,
  spacingClassName,
}: BlockShellProps) {
  return (
    <div
      className={cn(
        "group/block relative overflow-visible rounded-lg",
        spacingClassName,
        className
      )}
      style={blockIndentStyle(indent)}
    >
      {label ? (
        <span className="mb-1 block text-muted-foreground text-xs uppercase tracking-wide">
          {label}
        </span>
      ) : null}
      {children}
    </div>
  );
}
