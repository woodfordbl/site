import type { CanvasRow } from "@/lib/blocks/block-tree.ts";

/**
 * Collapsible-heading range logic. Headings are leaf blocks, so the content
 * "under" a heading is the run of following sibling rows in the same scope,
 * up to (but not including) the next heading of equal-or-higher level.
 * @see docs/architecture/block-model.md
 */

function headingLevel(row: CanvasRow): number | null {
  const block = row.effectiveBlock;
  return block.type === "heading" ? block.props.level : null;
}

/** True when at least one row follows `headingRowId` before the next equal/higher heading. */
export function headingHasCollapsibleContent(
  scopeRows: CanvasRow[],
  headingRowId: string
): boolean {
  const index = scopeRows.findIndex((row) => row.rowId === headingRowId);
  if (index === -1) {
    return false;
  }

  const level = headingLevel(scopeRows[index]);
  if (level === null) {
    return false;
  }

  const next = scopeRows[index + 1];
  if (!next) {
    return false;
  }

  const nextLevel = headingLevel(next);
  // Another heading immediately follows: only collapsible if it nests deeper.
  return nextLevel === null || nextLevel > level;
}

/**
 * Row ids hidden within a single sibling scope given the current collapsed
 * state. For each collapsed heading, every following sibling is hidden until a
 * heading whose level is equal or higher (smaller/equal number), or the end of
 * the scope. Nested collapsed headings inside a hidden run need no handling —
 * the whole run is already hidden.
 */
export function computeHiddenRowIds(
  scopeRows: CanvasRow[],
  isCollapsed: (row: CanvasRow) => boolean
): Set<string> {
  const hidden = new Set<string>();

  for (let index = 0; index < scopeRows.length; index += 1) {
    const row = scopeRows[index];
    const level = headingLevel(row);
    if (level === null || !isCollapsed(row)) {
      continue;
    }

    for (let next = index + 1; next < scopeRows.length; next += 1) {
      const candidate = scopeRows[next];
      const candidateLevel = headingLevel(candidate);
      if (candidateLevel !== null && candidateLevel <= level) {
        break;
      }
      hidden.add(candidate.rowId);
    }
  }

  return hidden;
}
