import { IconCaretRightFilled } from "@tabler/icons-react";
import type { MouseEvent, PointerEvent } from "react";

import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

/**
 * Filled caret that sits inline immediately after a toggle heading title.
 * Always visible; rotates when the section is expanded.
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
      className="size-6 shrink-0 self-center text-muted-foreground hover:text-foreground focus-visible:text-foreground"
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
      <IconCaretRightFilled
        className={cn(
          "size-3 text-muted-foreground transition-transform duration-150 ease-(--ease-out-strong)",
          !collapsed && "rotate-90"
        )}
      />
    </Button>
  );
}
