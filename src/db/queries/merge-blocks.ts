import {
  coerceContainerChildBlocks,
  normalizeBlock,
} from "@/lib/blocks/normalize-block.ts";
import { ORDER_STEP } from "@/lib/blocks/order-constants.ts";
import { isContainerBlockType } from "@/lib/canvas/block-spec.types.ts";
import type { Block } from "@/lib/schemas/block.ts";
import { getBlockParentId } from "@/lib/schemas/block.ts";

export interface CanvasRow {
  children: CanvasRow[];
  effectiveBlock: Block;
  rowId: string;
  sortOrder: number;
}

function coerceBlock(raw: unknown): Block | null {
  return normalizeBlock(raw);
}

function blocksInScope(blocks: Block[], parentId: string | null): Block[] {
  return blocks.filter((block) => getBlockParentId(block) === parentId);
}

function buildRow(
  block: Block,
  sortOrder: number,
  children: CanvasRow[]
): CanvasRow {
  const effectiveBlock = coerceBlock(block) ?? block;

  return {
    rowId: effectiveBlock.id,
    effectiveBlock,
    sortOrder,
    children,
  };
}

function mergeSiblingScope(
  blocks: Block[],
  parentId: string | null
): CanvasRow[] {
  const siblings = blocksInScope(blocks, parentId);

  return siblings.map((block, index) => {
    const children = isContainerBlockType(block.type)
      ? mergeSiblingScope(blocks, block.id)
      : [];

    return buildRow(block, index * ORDER_STEP, children);
  });
}

export function buildBlockTree(blocks: Block[]): CanvasRow[] {
  return mergeSiblingScope(coerceContainerChildBlocks(blocks), null);
}

export function flattenRows(rows: CanvasRow[]): CanvasRow[] {
  const flat: CanvasRow[] = [];
  for (const row of rows) {
    flat.push(row);
    flat.push(...flattenRows(row.children));
  }
  return flat;
}

export function findRowById(
  rows: CanvasRow[],
  rowId: string
): CanvasRow | undefined {
  for (const row of rows) {
    if (row.rowId === rowId) {
      return row;
    }
    const child = findRowById(row.children, rowId);
    if (child) {
      return child;
    }
  }
  return;
}

export function findRowContext(
  rows: CanvasRow[],
  rowId: string
): {
  row: CanvasRow;
  parent: CanvasRow | null;
  siblings: CanvasRow[];
  index: number;
  flatRows: CanvasRow[];
} | null {
  const flatRows = flattenRows(rows);
  const row = findRowById(rows, rowId);
  if (!row) {
    return null;
  }

  for (const top of rows) {
    const inTop = findInSiblings(top, rowId, null, rows);
    if (inTop) {
      return { ...inTop, flatRows };
    }
  }
  return null;
}

function findInSiblings(
  current: CanvasRow,
  rowId: string,
  parent: CanvasRow | null,
  siblings: CanvasRow[]
): {
  row: CanvasRow;
  parent: CanvasRow | null;
  siblings: CanvasRow[];
  index: number;
} | null {
  if (current.rowId === rowId) {
    const index = siblings.findIndex((s) => s.rowId === rowId);
    return { row: current, parent, siblings, index };
  }
  for (const child of current.children) {
    const found = findInSiblings(child, rowId, current, current.children);
    if (found) {
      return found;
    }
  }
  return null;
}

export function getPreviousBlockId(
  rows: CanvasRow[],
  rowId: string
): string | null {
  const context = findRowContext(rows, rowId);
  if (!context) {
    return null;
  }
  return context.siblings[context.index - 1]?.effectiveBlock.id ?? null;
}
