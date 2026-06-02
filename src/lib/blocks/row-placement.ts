import type { CanvasRow } from "@/db/queries/merge-blocks.ts";
import { findRowContext } from "@/db/queries/merge-blocks.ts";
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

export function chainPlacementPlans(
  rows: CanvasRow[],
  targetRowId: string,
  blocks: Block[],
  edge: "before" | "after" = "after"
): Array<{ block: Block; position: RowPlacement }> {
  if (blocks.length === 0) {
    return [];
  }

  const firstPlan = resolveRowPlacementPlan(rows, targetRowId, edge);
  if (!firstPlan) {
    return [];
  }

  const context = findRowContext(rows, targetRowId);
  if (!context) {
    return [];
  }

  const parentId = context.parent?.effectiveBlock.id ?? null;

  const prepared = blocks.map((block) =>
    parentId === null ? { ...block, parentId: null } : { ...block, parentId }
  );

  const firstBlock = prepared[0];
  if (!firstBlock) {
    return [];
  }

  const result: Array<{ block: Block; position: RowPlacement }> = [
    { block: firstBlock, position: firstPlan },
  ];

  let anchorRowId = firstBlock.id;
  for (let index = 1; index < prepared.length; index++) {
    const block = prepared[index];
    if (!block) {
      continue;
    }

    result.push({
      block,
      position: { parentId, anchorRowId, edge: "after" },
    });
    anchorRowId = block.id;
  }

  return result;
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
