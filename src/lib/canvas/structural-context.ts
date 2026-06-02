import type { CanvasRow } from "@/db/queries/merge-blocks.ts";
import { findRowContext, flattenRows } from "@/db/queries/merge-blocks.ts";
import { isRowEmpty } from "@/lib/blocks/is-block-empty.ts";
import { acceptsEmptyMergeFromAfter } from "@/lib/canvas/block-container-config.ts";
import type { Block } from "@/lib/schemas/block.ts";
import { getBlockParentId } from "@/lib/schemas/block.ts";

export interface StructuralContext {
  block: Block;
  caretAtStart: boolean;
  childCount: number;
  isEmpty: boolean;
  key: "Backspace" | "Delete";
  nextSibling: CanvasRow | null;
  parentId: string | null;
  parentRow: CanvasRow | null;
  previousCanvasRow: CanvasRow | null;
  previousSibling: CanvasRow | null;
  rowId: string;
}

export function buildStructuralContext(
  rows: CanvasRow[],
  rowId: string,
  options: {
    caretAtStart: boolean;
    key: "Backspace" | "Delete";
  }
): StructuralContext | null {
  const ctx = findRowContext(rows, rowId);
  if (!ctx) {
    return null;
  }

  const { row, parent, siblings, index } = ctx;
  const flatRows = flattenRows(rows);
  const flatIndex = flatRows.findIndex((r) => r.rowId === rowId);
  const previousCanvasRow =
    flatIndex > 0 ? (flatRows[flatIndex - 1] ?? null) : null;
  const previousSibling = index > 0 ? (siblings[index - 1] ?? null) : null;
  const nextSibling =
    index < siblings.length - 1 ? (siblings[index + 1] ?? null) : null;

  return {
    rowId,
    block: row.effectiveBlock,
    parentId: getBlockParentId(row.effectiveBlock),
    parentRow: parent,
    previousSibling,
    nextSibling,
    previousCanvasRow,
    caretAtStart: options.caretAtStart,
    isEmpty: isRowEmpty(row.effectiveBlock, row.children.length),
    key: options.key,
    childCount: row.children.length,
  };
}

export function previousRowAcceptsEmptyMerge(
  previous: CanvasRow | null
): boolean {
  if (!previous) {
    return false;
  }
  return acceptsEmptyMergeFromAfter(previous.effectiveBlock.type);
}
