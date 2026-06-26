import type { CanvasRow } from "@/lib/blocks/block-tree.ts";

/** Minimum vertical band (px) for column top-edge overclick / drop targets. */
export const COLUMN_SCOPE_EDGE_PX = 20;

/**
 * Resolve which column child row should be selected for a pointer Y inside a
 * column scope. Mirrors column drop geometry but returns a row id for highlight.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: column band geometry mirrors drop resolver
export function resolveColumnRowAtY(
  columnRow: CanvasRow,
  clientY: number,
  rowRects: Map<string, DOMRect>
): string | null {
  if (columnRow.effectiveBlock.type !== "column") {
    return null;
  }

  const children = columnRow.children;
  if (children.length === 0) {
    return null;
  }

  const firstChild = children[0];
  const lastChild = children.at(-1);
  const firstRect = firstChild ? rowRects.get(firstChild.rowId) : undefined;
  const lastRect = lastChild ? rowRects.get(lastChild.rowId) : undefined;

  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index];
    const rect = child ? rowRects.get(child.rowId) : undefined;
    if (!(child && rect)) {
      continue;
    }
    if (clientY >= rect.top && clientY <= rect.bottom) {
      return child.rowId;
    }
  }

  if (lastRect && lastChild && clientY > lastRect.bottom) {
    return lastChild.rowId;
  }

  if (
    firstRect &&
    firstChild &&
    clientY < firstRect.top + COLUMN_SCOPE_EDGE_PX
  ) {
    return firstChild.rowId;
  }

  for (let index = 0; index < children.length - 1; index += 1) {
    const child = children[index];
    const nextChild = children[index + 1];
    const rect = child ? rowRects.get(child.rowId) : undefined;
    const nextRect = nextChild ? rowRects.get(nextChild.rowId) : undefined;
    if (!(child && nextChild && rect && nextRect)) {
      continue;
    }
    if (clientY > rect.bottom && clientY < nextRect.top) {
      const midpoint = (rect.bottom + nextRect.top) / 2;
      return clientY < midpoint ? child.rowId : nextChild.rowId;
    }
  }

  return firstChild?.rowId ?? null;
}
