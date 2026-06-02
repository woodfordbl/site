import type { CanvasRow } from "@/db/queries/merge-blocks.ts";
import {
  buildBlockTree,
  findRowById,
  flattenRows,
} from "@/db/queries/merge-blocks.ts";
import type { RowPlacement } from "@/lib/blocks/row-placement.ts";
import type { Block } from "@/lib/schemas/block.ts";
import { getBlockParentId } from "@/lib/schemas/block.ts";

function siblingsForParent(
  rows: CanvasRow[],
  parentId: string | null
): CanvasRow[] {
  if (parentId === null) {
    return rows;
  }

  return findRowById(rows, parentId)?.children ?? [];
}

function flatIndexOfBlock(blocks: Block[], blockId: string): number {
  return blocks.findIndex((block) => block.id === blockId);
}

function isRowDescendantOf(
  rows: CanvasRow[],
  candidateRowId: string,
  ancestorRowId: string
): boolean {
  let current = findRowById(rows, candidateRowId);
  while (current) {
    const parentId = current.effectiveBlock.parentId ?? null;
    if (!parentId) {
      return false;
    }
    if (parentId === ancestorRowId) {
      return true;
    }
    current = findRowById(rows, parentId);
  }
  return false;
}

function indexAfterSubtree(
  blocks: Block[],
  rows: CanvasRow[],
  rowId: string
): number {
  const flatRows = flattenRows(rows);
  const start = flatRows.findIndex((row) => row.rowId === rowId);
  if (start === -1) {
    return blocks.length;
  }

  let lastDescendantIndex = start;
  for (let index = start + 1; index < flatRows.length; index += 1) {
    const row = flatRows[index];
    if (!row) {
      continue;
    }
    if (!isRowDescendantOf(rows, row.rowId, rowId)) {
      break;
    }
    lastDescendantIndex = index;
  }

  const lastDescendant = flatRows[lastDescendantIndex];
  if (!lastDescendant) {
    return blocks.length;
  }

  const flatIndex = flatIndexOfBlock(blocks, lastDescendant.effectiveBlock.id);
  return flatIndex === -1 ? blocks.length : flatIndex + 1;
}

function flatIndexAtScopeStart(
  blocks: Block[],
  rows: CanvasRow[],
  parentId: string | null
): number {
  const siblings = siblingsForParent(rows, parentId);

  if (siblings.length === 0) {
    if (parentId === null) {
      return 0;
    }

    const parentIndex = flatIndexOfBlock(blocks, parentId);
    return parentIndex === -1 ? blocks.length : parentIndex + 1;
  }

  const firstSibling = siblings[0];
  if (!firstSibling) {
    return blocks.length;
  }

  return flatIndexOfBlock(blocks, firstSibling.effectiveBlock.id);
}

function resolveInsertFlatIndex(
  blocks: Block[],
  rows: CanvasRow[],
  placement: RowPlacement
): number {
  if (placement.atScopeStart) {
    return flatIndexAtScopeStart(blocks, rows, placement.parentId);
  }

  const anchorRowId = placement.anchorRowId;
  const edge = placement.edge ?? "after";
  if (!anchorRowId) {
    return flatIndexAtScopeStart(blocks, rows, placement.parentId);
  }

  const siblings = siblingsForParent(rows, placement.parentId);
  const anchorIndex = siblings.findIndex((row) => row.rowId === anchorRowId);
  if (anchorIndex === -1) {
    return blocks.length;
  }

  const insertSiblingIndex = edge === "before" ? anchorIndex : anchorIndex + 1;

  if (insertSiblingIndex >= siblings.length) {
    const lastSibling = siblings.at(-1);
    if (!lastSibling) {
      return blocks.length;
    }

    return indexAfterSubtree(blocks, rows, lastSibling.rowId);
  }

  const targetRow = siblings[insertSiblingIndex];
  if (!targetRow) {
    return blocks.length;
  }

  return flatIndexOfBlock(blocks, targetRow.effectiveBlock.id);
}

function collectDescendantIds(blocks: Block[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const block of blocks) {
      const parentId = getBlockParentId(block);
      if (parentId && ids.has(parentId) && !ids.has(block.id)) {
        ids.add(block.id);
        changed = true;
      }
    }
  }

  return ids;
}

function withPlacementParent(block: Block, placement: RowPlacement): Block {
  return placement.parentId
    ? { ...block, parentId: placement.parentId }
    : { ...block, parentId: null };
}

export function insertBlockAtPlacement(
  blocks: Block[],
  rows: CanvasRow[],
  placement: RowPlacement,
  block: Block
): Block[] {
  const nextBlock = withPlacementParent(block, placement);
  const insertAt = resolveInsertFlatIndex(blocks, rows, placement);
  const next = [...blocks];
  next.splice(insertAt, 0, nextBlock);
  return next;
}

export function updateBlockByRowId(
  blocks: Block[],
  rowId: string,
  block: Block
): Block[] {
  return blocks.map((current) => (current.id === rowId ? block : current));
}

export function deleteBlockByRowId(
  blocks: Block[],
  rows: CanvasRow[],
  rowId: string
): Block[] {
  const row = findRowById(rows, rowId);
  if (!row) {
    return blocks;
  }

  const removeIds = collectDescendantIds(blocks, row.effectiveBlock.id);
  return blocks.filter((block) => !removeIds.has(block.id));
}

export function moveBlockByRowId(
  blocks: Block[],
  rows: CanvasRow[],
  rowId: string,
  placement: RowPlacement
): Block[] {
  const row = findRowById(rows, rowId);
  if (!row) {
    return blocks;
  }

  const movedBlock = withPlacementParent(row.effectiveBlock, placement);
  const withoutMoved = deleteBlockByRowId(blocks, rows, rowId);
  const nextRows = buildBlockTree(withoutMoved);
  return insertBlockAtPlacement(withoutMoved, nextRows, placement, movedBlock);
}

export function blocksFromRows(rows: CanvasRow[]): Block[] {
  return flattenRows(rows).map((row) => row.effectiveBlock);
}
