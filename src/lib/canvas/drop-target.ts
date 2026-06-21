import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { findRowContext } from "@/lib/blocks/block-tree.ts";

export interface DropTarget {
  atScopeStart?: boolean;
  edge: "before" | "after";
  rowId: string;
}

export function normalizeDropTarget(
  rows: CanvasRow[],
  rowId: string,
  edge: "before" | "after"
): DropTarget {
  if (edge === "before") {
    return { rowId, edge: "before" };
  }

  const context = findRowContext(rows, rowId);
  const nextSibling = context?.siblings[context.index + 1];
  if (nextSibling) {
    return { rowId: nextSibling.rowId, edge: "before" };
  }

  return { rowId, edge: "after" };
}
