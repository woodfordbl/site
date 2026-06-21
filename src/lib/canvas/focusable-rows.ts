import { isContainerBlockType } from "@/lib/blocks/block-defs.ts";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";

/** Depth-first flatten of canvas rows (container shells and children). */
export function flattenCanvasRows(rows: CanvasRow[]): CanvasRow[] {
  const flat: CanvasRow[] = [];
  const walk = (scope: CanvasRow[]) => {
    for (const row of scope) {
      flat.push(row);
      walk(row.children);
    }
  };
  walk(rows);
  return flat;
}

export function isFocusableCanvasRow(row: CanvasRow): boolean {
  return !isContainerBlockType(row.effectiveBlock.type);
}

/** Next leaf row above or below `index`, skipping list/checklist container shells. */
export function findFocusableAdjacentRow(
  flat: CanvasRow[],
  index: number,
  direction: "up" | "down"
): CanvasRow | undefined {
  if (direction === "up") {
    for (let i = index - 1; i >= 0; i--) {
      const row = flat[i];
      if (row && isFocusableCanvasRow(row)) {
        return row;
      }
    }
    return;
  }

  for (let i = index + 1; i < flat.length; i++) {
    const row = flat[i];
    if (row && isFocusableCanvasRow(row)) {
      return row;
    }
  }
  return;
}

export function findFocusableAdjacentRowId(
  rows: CanvasRow[],
  rowId: string,
  direction: "up" | "down"
): string | null {
  const flat = flattenCanvasRows(rows);
  const index = flat.findIndex((row) => row.rowId === rowId);
  if (index === -1) {
    return null;
  }
  return findFocusableAdjacentRow(flat, index, direction)?.rowId ?? null;
}
