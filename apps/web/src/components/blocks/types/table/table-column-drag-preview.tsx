import {
  TABLE_STRUCTURE_DRAG_HANDLE_OUTSET_PX,
  TableStructureDragPreviewHandle,
} from "@/components/blocks/types/table/table-structure-drag-preview-handle.tsx";
import { cn } from "@/lib/utils.ts";

export interface TableColumnDragPreviewState {
  cellHeights: number[];
  cellIsHeader: boolean[];
  cellLabels: string[];
  clientX: number;
  clientY: number;
  height: number;
  offsetX: number;
  offsetY: number;
  width: number;
}

export function measureTableColumnDragPreview(
  sourceId: string,
  pointer: { x: number; y: number }
): Omit<TableColumnDragPreviewState, "clientX" | "clientY"> | null {
  const anchor = document.querySelector(
    `[data-table-column-drag-id="${CSS.escape(sourceId)}"]`
  );
  if (!(anchor instanceof HTMLElement)) {
    return null;
  }

  const columnIndex = anchor.getAttribute("data-table-column-index");
  const table = anchor.closest("table");
  if (!(table && columnIndex)) {
    return null;
  }

  const cells = table.querySelectorAll<HTMLElement>(
    `[data-table-column-index="${columnIndex}"]`
  );
  if (cells.length === 0) {
    return null;
  }

  let top = Number.POSITIVE_INFINITY;
  let left = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  const cellLabels: string[] = [];
  const cellHeights: number[] = [];
  const cellIsHeader: boolean[] = [];

  for (const cell of cells) {
    const rect = cell.getBoundingClientRect();
    top = Math.min(top, rect.top);
    left = Math.min(left, rect.left);
    bottom = Math.max(bottom, rect.bottom);
    right = Math.max(right, rect.right);
    cellHeights.push(rect.height);
    cellIsHeader.push(cell.tagName === "TH");

    const field = cell.querySelector("input, textarea");
    const text =
      field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
        ? field.value
        : (cell.textContent ?? "");
    cellLabels.push(text.trim());
  }

  return {
    cellHeights,
    cellIsHeader,
    cellLabels,
    height: bottom - top,
    offsetX: pointer.x - left,
    offsetY: pointer.y - (top - TABLE_STRUCTURE_DRAG_HANDLE_OUTSET_PX),
    width: right - left,
  };
}

export function TableColumnDragPreview({
  preview,
}: {
  preview: TableColumnDragPreviewState;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-9999 text-sm opacity-92"
      data-table-column-drag-preview=""
      style={{
        transform: `translate3d(${preview.clientX - preview.offsetX}px, ${preview.clientY - preview.offsetY}px, 0)`,
        width: preview.width,
        height: preview.height,
      }}
    >
      <div className="pointer-events-none absolute top-0 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
        <TableStructureDragPreviewHandle axis="column" />
      </div>
      <div
        className={cn(
          "flex h-full flex-col overflow-hidden border-2 border-primary bg-background shadow-md"
        )}
      >
        {preview.cellLabels.map((label, index) => (
          <div
            className={cn(
              "flex min-h-0 items-start border-border border-b px-2 py-1.5 last:border-b-0",
              preview.cellIsHeader[index] && "bg-muted/40 font-medium"
            )}
            key={`${label}-${preview.cellHeights[index]}`}
            style={{ height: preview.cellHeights[index] }}
          >
            <span className="min-w-0 truncate">{label || "\u00a0"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
