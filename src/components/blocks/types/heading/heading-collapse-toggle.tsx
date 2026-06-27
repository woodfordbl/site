import { IconChevronRight } from "@tabler/icons-react";
import type { MouseEvent, PointerEvent } from "react";

import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { useHeadingCollapse } from "@/components/canvas/heading-collapse-context.tsx";
import { Button } from "@/components/ui/button.tsx";
import { type CanvasRow, findRowContext } from "@/lib/blocks/block-tree.ts";
import { headingHasCollapsibleContent } from "@/lib/blocks/heading-collapse.ts";
import { cn } from "@/lib/utils.ts";

/** Left padding that reserves the chevron slot beside a collapsible heading. */
export const headingCollapseIndentClassName = "pl-7";

interface HeadingCollapsibleState {
  collapsed: boolean;
  collapsible: boolean;
  toggle: () => void;
}

/**
 * Resolve whether a heading can collapse (has content under it in its scope)
 * and its current collapsed state. Drives both the reserved indent on the
 * heading wrapper and the chevron itself.
 */
export function useHeadingCollapsibleState(
  row: CanvasRow | undefined
): HeadingCollapsibleState {
  const { getRows } = useCanvasEditorContext();
  const { isCollapsed, toggle } = useHeadingCollapse();

  if (!row) {
    return { collapsed: false, collapsible: false, toggle: () => undefined };
  }

  const siblings = findRowContext(getRows(), row.rowId)?.siblings ?? [];
  const collapsible = headingHasCollapsibleContent(siblings, row.rowId);

  return {
    collapsed: isCollapsed(row),
    collapsible,
    toggle: () => toggle(row),
  };
}

/**
 * Chevron sitting in the reserved slot left of a heading. Hover-reveals on fine
 * pointers and stays visible on touch (via the `.hover-reveal` primitive). Sits
 * in positive padding (not the negative gutter lane), so it never collides with
 * the editor's row gutter.
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
      className="hover-reveal absolute top-0 bottom-0 left-0 my-auto size-6 text-muted-foreground"
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
