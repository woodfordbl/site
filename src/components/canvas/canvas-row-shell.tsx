import type { MouseEvent, ReactNode } from "react";

import {
  useCanvasEditorContext,
  useCanvasSelection,
} from "@/components/canvas/canvas-editor-context.tsx";
import { useDropTarget } from "@/components/dnd/use-dnd.ts";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import type { DropTarget } from "@/lib/canvas/resolve-drop-target.ts";
import { cn } from "@/lib/utils.ts";

interface CanvasRowShellProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Top-level block spacing applied to the content column when a gutter is shown. */
  contentSpacingClassName?: string;
  gutter?: ReactNode;
  /** Vertically centers gutter controls with short, non-text rows (e.g. divider). */
  gutterAlignCenter?: boolean;
  row: CanvasRow;
}

export function CanvasRowShell({
  row,
  gutter,
  gutterAlignCenter = false,
  contentSpacingClassName,
  children,
  className,
  contentClassName,
}: CanvasRowShellProps) {
  const { toggleRowSelection } = useCanvasEditorContext();
  const { isRowSelected } = useCanvasSelection();
  const isSelected = isRowSelected(row.rowId);

  const dropEdge = useDropTarget((target: DropTarget | null) => {
    if (target?.rowId !== row.rowId) {
      return null;
    }
    if (target.atScopeStart) {
      return "before" as const;
    }
    return target.edge;
  });

  const handleContentPointerDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.shiftKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    toggleRowSelection(row.rowId, { shiftKey: true });
  };
  const showBefore = dropEdge === "before";
  const showAfter = dropEdge === "after";

  return (
    <div
      className={cn("relative overflow-visible", className)}
      data-canvas-row-id={row.rowId}
      data-canvas-row-shell
    >
      {showBefore ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 bg-selection"
        />
      ) : null}
      <div
        className={cn(
          "flex min-w-0",
          gutterAlignCenter ? "items-center" : "items-start",
          contentSpacingClassName,
          gutter &&
            "[&:has([data-canvas-row-content]_[data-canvas-row-shell]:hover)>_[data-canvas-row-gutter-host]_.canvas-block-gutter]:opacity-0!",
          gutter &&
            "[&:focus-within>[data-canvas-row-gutter-host]_.canvas-block-gutter]:opacity-100",
          gutter &&
            "[&:hover>[data-canvas-row-gutter-host]_.canvas-block-gutter]:opacity-100"
        )}
        data-canvas-row-layout
      >
        {gutter ? (
          <div
            className={cn(
              "pointer-events-none -ml-12 w-12 shrink-0",
              "[&_.canvas-block-gutter]:opacity-0 [&_.canvas-block-gutter]:transition-opacity [&_.canvas-block-gutter]:duration-150 [&_.canvas-block-gutter]:ease-[var(--ease-out-strong)]",
              "hover:[&_.canvas-block-gutter]:opacity-100"
            )}
            data-canvas-row-gutter-host
          >
            <div className="pointer-events-auto h-fit">{gutter}</div>
          </div>
        ) : null}
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 rounded-lg transition-colors",
            isSelected && "bg-selection",
            contentClassName
          )}
          data-canvas-row-content
          onPointerDownCapture={handleContentPointerDown}
        >
          {children}
        </div>
      </div>
      {showAfter ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-0.5 bg-selection"
        />
      ) : null}
    </div>
  );
}
