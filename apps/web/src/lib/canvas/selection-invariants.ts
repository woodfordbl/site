import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { flattenRows } from "@/lib/blocks/block-tree.ts";

/**
 * Dev-only selection invariant checks. Normalization repairs these states
 * before they persist — the warning exists to point at the code path that
 * produced them, since ancestor+descendant selections and unknown ids fail
 * silently in production (double highlight, no-op operations).
 */
export function warnSelectionInvariants(
  rows: CanvasRow[],
  rowIds: readonly string[]
): void {
  if (!import.meta.env.DEV) {
    return;
  }

  const known = new Set(flattenRows(rows).map((row) => row.rowId));
  const unknown = rowIds.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    console.warn(
      "[canvas-selection] selected ids missing from the row tree:",
      unknown
    );
  }

  const selected = new Set(rowIds);
  const nested: string[] = [];
  const visit = (row: CanvasRow, underSelected: boolean): void => {
    if (underSelected && selected.has(row.rowId)) {
      nested.push(row.rowId);
    }
    const nextUnder = underSelected || selected.has(row.rowId);
    for (const child of row.children) {
      visit(child, nextUnder);
    }
  };
  for (const row of rows) {
    visit(row, false);
  }
  if (nested.length > 0) {
    console.warn(
      "[canvas-selection] descendants selected alongside an ancestor:",
      nested
    );
  }
}
