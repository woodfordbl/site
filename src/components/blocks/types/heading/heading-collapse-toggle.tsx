import { IconChevronRight } from "@tabler/icons-react";
import type { MouseEvent, PointerEvent } from "react";

import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

/**
 * Chevron that sits inline immediately after a toggle heading title. Hover-reveals
 * on fine pointers and stays visible on touch (via the `.hover-reveal` primitive).
 */
export function HeadingCollapseChevron({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      aria-expanded={!collapsed}
      aria-label={collapsed ? "Expand section" : "Collapse section"}
      className="hover-reveal size-6 shrink-0 self-center text-muted-foreground"
      // Keep clicks off the row: no selection, drag, or caret move.
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onToggle();
      }}
      onMouseDown={(event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
      }}
      onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
      }}
      size="icon-xs"
      type="button"
      variant="ghost"
    >
      <IconChevronRight
        className={cn(
          "transition-transform duration-150 [transition-timing-function:var(--ease-out-strong)]",
          !collapsed && "rotate-90"
        )}
      />
    </Button>
  );
}
