import {
  TABLE_STRUCTURE_DRAG_HANDLE_OUTSET_PX,
  TableStructureDragPreviewHandle,
} from "@/components/blocks/types/table/table-structure-drag-preview-handle.tsx";
import { cn } from "@/lib/utils.ts";

export interface TableRowDragPreviewState {
  cellIsHeader: boolean[];
  cellLabels: string[];
  cellWidths: number[];
  clientX: number;
  clientY: number;
  height: number;
  offsetX: number;
  offsetY: number;
  width: number;
}

export function measureTableRowDragPreview(
  sourceId: string,
  pointer: { x: number; y: number }
): Omit<TableRowDragPreviewState, "clientX" | "clientY"> | null {
  const row = document.querySelector(
    `[data-table-row-id="${CSS.escape(sourceId)}"]`
  );
  if (!(row instanceof HTMLElement)) {
    return null;
  }

  const cells = row.querySelectorAll<HTMLElement>("td, th");
  if (cells.length === 0) {
    return null;
  }

  let top = Number.POSITIVE_INFINITY;
  let left = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  const cellLabels: string[] = [];
  const cellWidths: number[] = [];
  const cellIsHeader: boolean[] = [];

  for (const cell of cells) {
    const rect = cell.getBoundingClientRect();
    top = Math.min(top, rect.top);
    left = Math.min(left, rect.left);
    bottom = Math.max(bottom, rect.bottom);
    right = Math.max(right, rect.right);
    cellWidths.push(rect.width);
    cellIsHeader.push(cell.tagName === "TH");

    const field = cell.querySelector("input, textarea");
    const text =
      field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
        ? field.value
        : (cell.textContent ?? "");
    cellLabels.push(text.trim());
  }

  const previewLeft = left - TABLE_STRUCTURE_DRAG_HANDLE_OUTSET_PX;

  return {
    cellIsHeader,
    cellLabels,
    cellWidths,
    height: bottom - top,
    offsetX: pointer.x - previewLeft,
    offsetY: pointer.y - top,
    width: right - left,
  };
}

export function TableRowDragPreview({
  preview,
}: {
  preview: TableRowDragPreviewState;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-9999 text-sm opacity-92"
      data-table-row-drag-preview=""
      style={{
        transform: `translate3d(${preview.clientX - preview.offsetX}px, ${preview.clientY - preview.offsetY}px, 0)`,
        width: preview.width + TABLE_STRUCTURE_DRAG_HANDLE_OUTSET_PX,
        height: preview.height,
      }}
    >
      <div className="pointer-events-none absolute top-1/2 left-0 z-10 -translate-x-1/2 -translate-y-1/2">
        <TableStructureDragPreviewHandle axis="row" />
      </div>
      <div
        className={cn(
          "flex h-full overflow-hidden border-2 border-primary bg-background shadow-md"
        )}
        style={{ marginLeft: TABLE_STRUCTURE_DRAG_HANDLE_OUTSET_PX }}
      >
        {preview.cellLabels.map((label, index) => (
          <div
            className={cn(
              "flex min-h-0 min-w-0 items-start border-border border-r px-2 py-1.5 last:border-r-0",
              preview.cellIsHeader[index] && "bg-muted/40 font-medium"
            )}
            key={`${label}-${index}`}
            style={{ width: preview.cellWidths[index] }}
          >
            <span className="min-w-0 truncate">{label || "\u00a0"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
