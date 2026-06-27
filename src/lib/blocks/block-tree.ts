import { isContainerBlockType } from "@/lib/blocks/block-defs.ts";
import {
  coerceContainerChildBlocks,
  ensureColumnMinimumChildren,
  ensureTableMinimumGrid,
  ensureTabMinimumChildren,
  normalizeBlock,
} from "@/lib/blocks/normalize-block.ts";
import type { Block } from "@/lib/schemas/block.ts";
import { getBlockParentId } from "@/lib/schemas/block.ts";

/**
 * Pure block-tree shape shared by the canvas: an ordered forest of rows where
 * container blocks own their children via `parentId`.
 * @see docs/architecture/block-model.md
 */
export interface CanvasRow {
  children: CanvasRow[];
  effectiveBlock: Block;
  rowId: string;
}

/** Same input object → same normalized result, so unchanged blocks keep row identity across rebuilds. */
const normalizedBlockCache = new WeakMap<object, Block | null>();

function coerceBlock(raw: Block): Block | null {
  const cached = normalizedBlockCache.get(raw);
  if (cached !== undefined) {
    return cached;
  }
  const normalized = normalizeBlock(raw);
  normalizedBlockCache.set(raw, normalized);
  return normalized;
}

function buildRow(block: Block, children: CanvasRow[]): CanvasRow {
  const effectiveBlock = coerceBlock(block) ?? block;

  return {
    rowId: effectiveBlock.id,
    effectiveBlock,
    children,
  };
}

function groupBlocksByParent(blocks: Block[]): Map<string | null, Block[]> {
  const byParent = new Map<string | null, Block[]>();
  for (const block of blocks) {
    const parentId = getBlockParentId(block);
    const scope = byParent.get(parentId);
    if (scope) {
      scope.push(block);
    } else {
      byParent.set(parentId, [block]);
    }
  }
  return byParent;
}

function mergeSiblingScope(
  byParent: Map<string | null, Block[]>,
  parentId: string | null
): CanvasRow[] {
  const siblings = byParent.get(parentId) ?? [];

  return siblings.map((block) => {
    const children = isContainerBlockType(block.type)
      ? mergeSiblingScope(byParent, block.id)
      : [];

    return buildRow(block, children);
  });
}

/** Build the canvas row forest from already-ordered blocks (order preserved per scope). */
export function buildBlockTree(blocks: Block[]): CanvasRow[] {
  const normalized = ensureTableMinimumGrid(
    ensureTabMinimumChildren(
      ensureColumnMinimumChildren(coerceContainerChildBlocks(blocks))
    )
  );
  return mergeSiblingScope(groupBlocksByParent(normalized), null);
}

function shallowPropsEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): boolean {
  if (a === b) {
    return true;
  }
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) {
    return false;
  }
  return aKeys.every((key) => Object.is(a[key], b[key]));
}

/** Block props are flat primitives, so shallow comparison is exact. */
function blocksEquivalent(a: Block, b: Block): boolean {
  return (
    a.id === b.id &&
    a.type === b.type &&
    (a.parentId ?? null) === (b.parentId ?? null) &&
    (a.indent ?? 0) === (b.indent ?? 0) &&
    shallowPropsEqual(a.props, b.props)
  );
}

/**
 * Structural sharing across tree rebuilds: rows whose block content and
 * subtree are unchanged keep their previous object identity, so memoized row
 * components bail out and a keystroke re-renders only the edited row.
 */
export function reconcileRowTrees(
  previousRows: CanvasRow[],
  nextRows: CanvasRow[]
): CanvasRow[] {
  if (previousRows.length === 0) {
    return nextRows;
  }

  const previousById = new Map(
    flattenRows(previousRows).map((row) => [row.rowId, row])
  );

  const visit = (next: CanvasRow): CanvasRow => {
    const children = next.children.map(visit);
    const previous = previousById.get(next.rowId);

    if (
      previous &&
      blocksEquivalent(previous.effectiveBlock, next.effectiveBlock) &&
      children.length === previous.children.length &&
      children.every((child, index) => child === previous.children[index])
    ) {
      return previous;
    }

    const childrenChanged = children.some(
      (child, index) => child !== next.children[index]
    );
    return childrenChanged ? { ...next, children } : next;
  };

  const reconciled = nextRows.map(visit);
  const unchanged =
    reconciled.length === previousRows.length &&
    reconciled.every((row, index) => row === previousRows[index]);
  return unchanged ? previousRows : reconciled;
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
