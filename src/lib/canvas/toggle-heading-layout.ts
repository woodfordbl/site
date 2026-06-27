import { getBlockIndent } from "@/lib/blocks/block-indent.ts";
import { type CanvasRow, findRowContext } from "@/lib/blocks/block-tree.ts";
import {
  createEmptyBlock,
  getTextFromBlock,
} from "@/lib/blocks/create-block.ts";
import type { CanvasEffect } from "@/lib/canvas/effects.ts";
import type { Block } from "@/lib/schemas/block.ts";

type HeadingLevel = 1 | 2 | 3 | 4;

/** Heading-like level of a sibling row, or null when it is neither kind of heading. */
function siblingHeadingLevel(row: CanvasRow): number | null {
  const block = row.effectiveBlock;
  if (block.type === "heading" || block.type === "toggleHeading") {
    return block.props.level;
  }
  return null;
}

/**
 * Following siblings that belong "under" a heading of `level`: every row after
 * the source up to (but not including) the next heading/toggleHeading whose
 * level is equal or higher (smaller-or-equal number). A deeper heading is
 * absorbed; an equal/higher one ends the run.
 */
export function collectAbsorbableSiblings(
  siblings: CanvasRow[],
  index: number,
  level: HeadingLevel
): CanvasRow[] {
  const absorbed: CanvasRow[] = [];
  for (let next = index + 1; next < siblings.length; next += 1) {
    const sibling = siblings[next];
    const siblingLevel = siblingHeadingLevel(sibling);
    if (siblingLevel !== null && siblingLevel <= level) {
      break;
    }
    absorbed.push(sibling);
  }
  return absorbed;
}

/**
 * Convert a row into a toggle heading. When `absorb` is set (the gutter "Turn
 * into" path), the following same-scope siblings up to the next equal/higher
 * heading are re-parented into the toggle as its children. Slash inserts pass
 * `absorb: false`, producing an empty toggle.
 */
export function planToggleHeadingCreate(
  rows: CanvasRow[],
  rowId: string,
  level: HeadingLevel,
  options?: { seedText?: string; absorb?: boolean }
): CanvasEffect[] {
  const ctx = findRowContext(rows, rowId);
  if (!ctx) {
    return [];
  }

  const source = ctx.row.effectiveBlock;
  // Re-leveling an existing toggle keeps its children and collapsed state and
  // must not absorb new siblings.
  const alreadyToggle = source.type === "toggleHeading";
  const text = options?.seedText ?? getTextFromBlock(source);
  const toggleBlock: Block = {
    ...createEmptyBlock("toggleHeading"),
    id: rowId,
    indent: getBlockIndent(source),
    parentId: source.parentId ?? null,
    props: {
      level,
      text,
      ...(alreadyToggle && source.props.collapsed
        ? { collapsed: source.props.collapsed }
        : {}),
    },
  };

  const effects: CanvasEffect[] = [
    { type: "persist", rowId, block: toggleBlock },
  ];

  const absorbed =
    options?.absorb && !alreadyToggle
      ? collectAbsorbableSiblings(ctx.siblings, ctx.index, level)
      : [];

  let anchorRowId: string | undefined;
  for (const [index, sibling] of absorbed.entries()) {
    const position =
      index === 0
        ? { parentId: rowId, atScopeStart: true as const }
        : {
            parentId: rowId,
            anchorRowId: anchorRowId ?? absorbed[0]?.rowId,
            edge: "after" as const,
          };
    effects.push({ type: "move", rowId: sibling.rowId, position });
    anchorRowId = sibling.rowId;
  }

  effects.push({ type: "focus", rowId, placement: "end" });
  return effects;
}

/**
 * Convert a toggle heading back into a leaf block (`heading`/`text`), lifting
 * its children out as following siblings in order. The caller supplies the
 * already-converted leaf block to persist in place.
 */
export function planToggleHeadingUnwrap(
  rows: CanvasRow[],
  toggleRowId: string,
  convertedLeaf: Block
): CanvasEffect[] {
  const ctx = findRowContext(rows, toggleRowId);
  if (ctx?.row.effectiveBlock.type !== "toggleHeading") {
    return [];
  }

  // Move the children out FIRST, while the row is still a container so they
  // resolve in the tree; persisting the leaf first would orphan them. Mirrors
  // `planTabsUnwrap`.
  const effects: CanvasEffect[] = [];
  const children = ctx.row.children;
  const parentId = ctx.row.effectiveBlock.parentId ?? null;
  let anchorRowId = toggleRowId;
  for (const child of children) {
    effects.push({
      type: "move",
      rowId: child.rowId,
      position: { parentId, anchorRowId, edge: "after" as const },
    });
    anchorRowId = child.rowId;
  }

  effects.push({ type: "persist", rowId: toggleRowId, block: convertedLeaf });
  effects.push({ type: "focus", rowId: toggleRowId, placement: "end" });
  return effects;
}
