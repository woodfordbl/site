import type { MouseEvent, ReactNode } from "react";

import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import type { CanvasRow } from "@/db/queries/merge-blocks.ts";
import { cn } from "@/lib/utils.ts";

export type CanvasRowHoverGroup = "canvas-row" | "list-item-row";

const canvasRowGroupClass: Record<CanvasRowHoverGroup, string> = {
  "canvas-row": "group/canvas-row",
  "list-item-row": "group/list-item-row",
};

interface CanvasRowShellProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  gutter?: ReactNode;
  gutterClassName?: string;
  hoverGroup?: CanvasRowHoverGroup;
  row: CanvasRow;
}

export function CanvasRowShell({
  row,
  gutter,
  gutterClassName,
  children,
  className,
  contentClassName,
  hoverGroup = "canvas-row",
}: CanvasRowShellProps) {
  const { isRowSelected, dropTarget, toggleRowSelection } =
    useCanvasEditorContext();
  const isSelected = isRowSelected(row.rowId);

  const handleContentPointerDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.shiftKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    toggleRowSelection(row.rowId, { shiftKey: true });
  };
  const showBefore =
    dropTarget?.rowId === row.rowId && dropTarget.edge === "before";
  const showAfter =
    dropTarget?.rowId === row.rowId && dropTarget.edge === "after";

  return (
    <div
      className={cn(
        canvasRowGroupClass[hoverGroup],
        "relative overflow-visible",
        className
      )}
      data-canvas-list-item-row={
        hoverGroup === "list-item-row" ? "" : undefined
      }
      data-canvas-row-id={row.rowId}
    >
      {showBefore ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 bg-selection"
        />
      ) : null}
      {gutter ? (
        <div
          className={cn(
            "pointer-events-none absolute right-full",
            gutterClassName ?? "top-0"
          )}
        >
          <div className="pointer-events-auto">{gutter}</div>
        </div>
      ) : null}
      <div
        className={cn(
          "min-h-0 min-w-0 rounded-lg transition-colors",
          isSelected && "bg-selection",
          contentClassName
        )}
        data-canvas-row-content
        onPointerDownCapture={handleContentPointerDown}
      >
        {children}
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
