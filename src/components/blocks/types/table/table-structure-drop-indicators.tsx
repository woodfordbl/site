import { useLayoutEffect, useMemo, useState } from "react";

import {
  useCanvasRowDropTarget,
  useDropTarget,
} from "@/components/dnd/use-dnd.ts";
import type { DropTarget } from "@/lib/canvas/resolve-drop-target.ts";

interface TableColumnDropTarget {
  columnIndex: number;
  edge: "before" | "after";
  tableId: string;
}

interface TableStructureDropIndicatorsProps {
  columnWidths: number[];
  tableId: string;
  tableRowIds: ReadonlySet<string>;
  tableWidthPx: number;
}

function sumWidthsBefore(widths: number[], index: number): number {
  let total = 0;
  for (let i = 0; i < index; i += 1) {
    total += widths[i] ?? 0;
  }
  return total;
}

/** One full-table overlay for row/column reorder drop lines. */
export function TableStructureDropIndicators({
  columnWidths,
  tableId,
  tableRowIds,
  tableWidthPx,
}: TableStructureDropIndicatorsProps) {
  const columnTarget = useDropTarget((target: TableColumnDropTarget | null) =>
    target?.tableId === tableId ? target : null
  );

  const rowTarget = useCanvasRowDropTarget((target: DropTarget | null) => {
    if (!(target?.rowId && tableRowIds.has(target.rowId))) {
      return null;
    }
    return target;
  });

  const columnBoundaryX = useMemo(() => {
    if (!columnTarget) {
      return null;
    }

    const columnLeft = sumWidthsBefore(columnWidths, columnTarget.columnIndex);
    const columnWidth = columnWidths[columnTarget.columnIndex] ?? 0;
    return columnTarget.edge === "before"
      ? columnLeft
      : columnLeft + columnWidth;
  }, [columnTarget, columnWidths]);

  const [rowBoundaryY, setRowBoundaryY] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!rowTarget) {
      setRowBoundaryY(null);
      return;
    }

    const measureRowBoundary = () => {
      const table = document.querySelector(
        `[data-table-id="${CSS.escape(tableId)}"] table`
      );
      const row = document.querySelector(
        `[data-table-row-id="${CSS.escape(rowTarget.rowId)}"]`
      );
      if (!(table instanceof HTMLElement && row instanceof HTMLElement)) {
        setRowBoundaryY(null);
        return;
      }

      if (!row.closest(`[data-table-id="${CSS.escape(tableId)}"]`)) {
        setRowBoundaryY(null);
        return;
      }

      const tableRect = table.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const rowTop = rowRect.top - tableRect.top;
      const rowHeight = rowRect.height;
      const edge = rowTarget.atScopeStart
        ? ("before" as const)
        : rowTarget.edge;

      setRowBoundaryY(edge === "before" ? rowTop : rowTop + rowHeight);
    };

    measureRowBoundary();
    window.addEventListener("scroll", measureRowBoundary, true);
    window.addEventListener("resize", measureRowBoundary);
    return () => {
      window.removeEventListener("scroll", measureRowBoundary, true);
      window.removeEventListener("resize", measureRowBoundary);
    };
  }, [rowTarget, tableId]);

  if (columnBoundaryX == null && rowBoundaryY == null) {
    return null;
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 overflow-visible"
      data-table-structure-drop-indicators=""
    >
      {columnBoundaryX == null ? null : (
        <div
          className="absolute top-0 bottom-0 w-1 -translate-x-1/2 bg-selection-primary"
          style={{ left: columnBoundaryX }}
        />
      )}
      {rowBoundaryY == null ? null : (
        <div
          className="absolute left-0 h-1 -translate-y-1/2 bg-selection-primary"
          style={{ top: rowBoundaryY, width: tableWidthPx }}
        />
      )}
    </div>
  );
}
