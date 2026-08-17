import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { findRowContext } from "@/lib/blocks/block-tree.ts";
import {
  getActiveCanvasRowId,
  rowIdsInDocumentOrder,
} from "@/lib/canvas/block-selection.ts";

interface ResolveDuplicateRowIdOptions {
  rowId?: string | null;
  selectedRowIds: readonly string[];
}

/** Resolves which canvas row `duplicateRow` should clone for the current target. */
export function resolveDuplicateRowId(
  rows: CanvasRow[],
  options: ResolveDuplicateRowIdOptions
): string | null {
  const candidate =
    options.selectedRowIds.length > 0
      ? (rowIdsInDocumentOrder(rows, options.selectedRowIds).at(-1) ?? null)
      : (options.rowId ?? null);

  if (!candidate) {
    return null;
  }

  const context = findRowContext(rows, candidate);
  if (!context) {
    return null;
  }

  if (context.row.effectiveBlock.type === "tableCell") {
    return context.parent?.rowId ?? null;
  }

  return candidate;
}

export function resolveDuplicateRowTargetFromFocus(
  rows: CanvasRow[],
  selectedRowIds: readonly string[]
): string | null {
  return resolveDuplicateRowId(rows, {
    rowId: getActiveCanvasRowId(),
    selectedRowIds,
  });
}
