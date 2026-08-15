import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { findRowContext } from "@/lib/blocks/block-tree.ts";
import type { Block } from "@/lib/schemas/block.ts";

export interface RowPlacement {
  /** Row to insert relative to; omitted when `atScopeStart` is true. */
  anchorRowId?: string;
  /** Insert at the start of `parentId` scope (empty list, first canvas row, etc.). */
  atScopeStart?: boolean;
  edge?: "before" | "after";
  parentId: string | null;
}

export function resolveInsertSiblingIndex(
  _siblings: CanvasRow[],
  targetIndex: number,
  edge: "before" | "after"
): number {
  return edge === "before" ? targetIndex : targetIndex + 1;
}

export function resolveRowPlacementPlan(
  rows: CanvasRow[],
  targetRowId: string,
  edge: "before" | "after"
): RowPlacement | null {
  const context = findRowContext(rows, targetRowId);
  if (!context) {
    return null;
  }

  const parentId = context.parent?.effectiveBlock.id ?? null;

  return { parentId, anchorRowId: targetRowId, edge };
}

export function resolveScopeStartPlacement(
  rows: CanvasRow[],
  parentId: string | null
): RowPlacement {
  const siblings = parentId
    ? (rows.find((row) => row.effectiveBlock.id === parentId)?.children ?? [])
    : rows;

  const firstSibling = siblings[0];
  if (firstSibling) {
    return { parentId, anchorRowId: firstSibling.rowId, edge: "before" };
  }

  return { parentId, atScopeStart: true };
}

export function resolveRowMovePlan(
  rows: CanvasRow[],
  sourceRowId: string,
  targetRowId: string,
  edge: "before" | "after"
): { position: RowPlacement } | null {
  if (sourceRowId === targetRowId) {
    return null;
  }

  const sourceContext = findRowContext(rows, sourceRowId);
  const targetContext = findRowContext(rows, targetRowId);
  if (!(sourceContext && targetContext)) {
    return null;
  }

  if (isDescendantRow(sourceContext.row, targetRowId)) {
    return null;
  }

  const position = resolveRowPlacementPlan(rows, targetRowId, edge);
  if (!position) {
    return null;
  }

  return { position };
}

function isDescendantRow(row: CanvasRow, rowId: string): boolean {
  for (const child of row.children) {
    if (child.rowId === rowId) {
      return true;
    }
    if (isDescendantRow(child, rowId)) {
      return true;
    }
  }
  return false;
}

export function placementAfterRow(
  rows: CanvasRow[],
  rowId: string
): RowPlacement | null {
  return resolveRowPlacementPlan(rows, rowId, "after");
}
