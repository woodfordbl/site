import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { findRowById, flattenRows } from "@/lib/blocks/block-tree.ts";
import type { Block } from "@/lib/schemas/block.ts";

export interface BlockSelectionState {
  anchorRowId: string | null;
  selectedRowIds: string[];
}

export const emptyBlockSelection: BlockSelectionState = {
  selectedRowIds: [],
  anchorRowId: null,
};

/** Row id for the block field that currently has DOM focus (caret in editor). */
export function getActiveCanvasRowId(): string | null {
  const active = document.activeElement;
  if (!(active instanceof Element)) {
    return null;
  }

  const row = active.closest("[data-canvas-row-id]");
  return row?.getAttribute("data-canvas-row-id") ?? null;
}

export function isRowSelected(
  selection: BlockSelectionState,
  rowId: string
): boolean {
  return selection.selectedRowIds.includes(rowId);
}

export function rowIdsInDocumentOrder(
  rows: CanvasRow[],
  rowIds: readonly string[]
): string[] {
  const flat = flattenRows(rows);
  const order = new Map(flat.map((row, index) => [row.rowId, index]));
  return [...rowIds]
    .filter((rowId) => order.has(rowId))
    .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

export function rowIdsInReverseDocumentOrder(
  rows: CanvasRow[],
  rowIds: readonly string[]
): string[] {
  return rowIdsInDocumentOrder(rows, rowIds).reverse();
}

/** Top or bottom selected row in document order (for Shift+Arrow extend). */
export function selectionEdgeRowId(
  rows: CanvasRow[],
  selectedRowIds: readonly string[],
  direction: "up" | "down"
): string | null {
  const ordered = rowIdsInDocumentOrder(rows, selectedRowIds);
  if (ordered.length === 0) {
    return null;
  }
  return direction === "up" ? ordered[0] : (ordered.at(-1) ?? null);
}

export function rangeRowIdsBetween(
  rows: CanvasRow[],
  anchorRowId: string,
  targetRowId: string
): string[] {
  const ordered = flattenRows(rows).map((row) => row.rowId);
  const anchorIndex = ordered.indexOf(anchorRowId);
  const targetIndex = ordered.indexOf(targetRowId);
  if (anchorIndex === -1 || targetIndex === -1) {
    return [targetRowId];
  }

  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return ordered.slice(start, end + 1);
}

/** Expand list containers to include nested rows when deleting. */
export function expandRowIdsForDelete(
  rows: CanvasRow[],
  rowIds: readonly string[]
): string[] {
  const expanded = new Set<string>();

  for (const rowId of rowIds) {
    const row = findRowById(rows, rowId);
    if (!row) {
      continue;
    }
    for (const nested of flattenRows([row])) {
      expanded.add(nested.rowId);
    }
  }

  return rowIdsInDocumentOrder(rows, [...expanded]);
}

export function listContainerChildRowIds(row: CanvasRow): string[] {
  if (row.effectiveBlock.type !== "list") {
    return [];
  }

  return flattenRows(row.children).map((child) => child.rowId);
}

export function selectionIncludesAllListChildren(
  rows: CanvasRow[],
  selection: BlockSelectionState,
  listRowId: string
): boolean {
  const row = findRowById(rows, listRowId);
  if (!row || row.effectiveBlock.type !== "list") {
    return false;
  }

  const childIds = listContainerChildRowIds(row);
  if (childIds.length === 0) {
    return selection.selectedRowIds.includes(listRowId);
  }

  const selected = new Set(selection.selectedRowIds);
  return childIds.every((id) => selected.has(id));
}

export function expandListContainerSelection(
  rows: CanvasRow[],
  rowId: string
): string[] {
  const row = findRowById(rows, rowId);
  if (!row || row.effectiveBlock.type !== "list") {
    return [rowId];
  }

  const childIds = listContainerChildRowIds(row);
  if (childIds.length === 0) {
    return [rowId];
  }

  return rowIdsInDocumentOrder(rows, childIds);
}

export function isRowSelectedInUi(
  rows: CanvasRow[],
  selection: BlockSelectionState,
  rowId: string
): boolean {
  if (selection.selectedRowIds.includes(rowId)) {
    return true;
  }

  return selectionIncludesAllListChildren(rows, selection, rowId);
}

function toggleShiftBlockSelection(
  rows: CanvasRow[],
  selection: BlockSelectionState,
  rowId: string,
  focusRowId?: string | null
): BlockSelectionState {
  const anchor = selection.anchorRowId ?? focusRowId ?? null;
  if (anchor) {
    return {
      anchorRowId: anchor,
      selectedRowIds: rangeRowIdsBetween(rows, anchor, rowId),
    };
  }

  return {
    anchorRowId: rowId,
    selectedRowIds: expandListContainerSelection(rows, rowId),
  };
}

function toggleMetaBlockSelection(
  rows: CanvasRow[],
  selection: BlockSelectionState,
  rowId: string,
  row: CanvasRow | undefined,
  isListContainer: boolean
): BlockSelectionState {
  const selected = new Set(selection.selectedRowIds);

  if (isListContainer && row) {
    const childIds = listContainerChildRowIds(row);
    if (childIds.length > 0) {
      const allSelected = childIds.every((id) => selected.has(id));
      for (const id of childIds) {
        if (allSelected) {
          selected.delete(id);
        } else {
          selected.add(id);
        }
      }

      return {
        anchorRowId: rowId,
        selectedRowIds: rowIdsInDocumentOrder(rows, [...selected]),
      };
    }
  }

  if (selected.has(rowId)) {
    selected.delete(rowId);
  } else {
    selected.add(rowId);
  }

  return {
    anchorRowId: rowId,
    selectedRowIds: rowIdsInDocumentOrder(rows, [...selected]),
  };
}

function togglePlainBlockSelection(
  rows: CanvasRow[],
  selection: BlockSelectionState,
  rowId: string,
  row: CanvasRow | undefined,
  isListContainer: boolean
): BlockSelectionState {
  if (isListContainer && row) {
    const childIds = listContainerChildRowIds(row);
    if (childIds.length > 0) {
      if (selectionIncludesAllListChildren(rows, selection, rowId)) {
        return emptyBlockSelection;
      }

      return {
        anchorRowId: rowId,
        selectedRowIds: rowIdsInDocumentOrder(rows, childIds),
      };
    }
  }

  const isOnlySelected =
    selection.selectedRowIds.length === 1 &&
    selection.selectedRowIds[0] === rowId;

  if (isOnlySelected) {
    return emptyBlockSelection;
  }

  return {
    anchorRowId: rowId,
    selectedRowIds: [rowId],
  };
}

export function toggleBlockSelection(
  rows: CanvasRow[],
  selection: BlockSelectionState,
  rowId: string,
  modifiers?: { metaKey?: boolean; shiftKey?: boolean },
  focusRowId?: string | null
): BlockSelectionState {
  const row = findRowById(rows, rowId);
  const isChildSelectContainer =
    row?.effectiveBlock.type === "list" ||
    row?.effectiveBlock.type === "checklist";

  if (modifiers?.shiftKey) {
    return toggleShiftBlockSelection(rows, selection, rowId, focusRowId);
  }

  if (modifiers?.metaKey) {
    return toggleMetaBlockSelection(
      rows,
      selection,
      rowId,
      row,
      isChildSelectContainer
    );
  }

  return togglePlainBlockSelection(
    rows,
    selection,
    rowId,
    row,
    isChildSelectContainer
  );
}

export function selectAllRows(rows: CanvasRow[]): BlockSelectionState {
  const selectedRowIds = flattenRows(rows).map((row) => row.rowId);
  return {
    anchorRowId: selectedRowIds[0] ?? null,
    selectedRowIds,
  };
}

/**
 * Resolve a selection to copyable blocks: rows whose ancestor is also selected
 * collapse into that ancestor's subtree, and each kept root contributes its
 * full subtree (container shells plus children, document order, original ids —
 * paste remaps ids and reparents).
 */
export function subtreeBlocksFromSelectedRows(
  rows: CanvasRow[],
  selectedRowIds: readonly string[]
): Block[] {
  const selected = new Set(selectedRowIds);
  const blocks: Block[] = [];

  const visit = (row: CanvasRow): void => {
    if (selected.has(row.rowId)) {
      for (const flat of flattenRows([row])) {
        blocks.push(flat.effectiveBlock);
      }
      return;
    }
    for (const child of row.children) {
      visit(child);
    }
  };

  for (const row of rows) {
    visit(row);
  }

  return blocks;
}
