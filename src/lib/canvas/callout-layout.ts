import { getBlockIndent } from "@/lib/blocks/block-indent.ts";
import { type CanvasRow, findRowContext } from "@/lib/blocks/block-tree.ts";
import { DEFAULT_CALLOUT_ICON } from "@/lib/blocks/callout-defaults.ts";
import {
  buildContainerChildBlock,
  createEmptyBlock,
  getTextFromBlock,
} from "@/lib/blocks/create-block.ts";
import { resolveRowPlacementPlan } from "@/lib/blocks/row-placement.ts";
import type { CanvasEffect } from "@/lib/canvas/effects.ts";
import type { Block } from "@/lib/schemas/block.ts";

/**
 * Convert a row into a callout container. The source row's text is seeded into
 * the callout's first `text` child (the callout itself owns no primary text).
 * Re-converting an existing callout keeps its children and icon.
 */
export function planCalloutCreate(
  rows: CanvasRow[],
  rowId: string,
  options?: { seedText?: string }
): CanvasEffect[] {
  const ctx = findRowContext(rows, rowId);
  if (!ctx) {
    return [];
  }

  const source = ctx.row.effectiveBlock;
  const alreadyCallout = source.type === "callout";
  const calloutBlock: Block = {
    ...createEmptyBlock("callout"),
    id: rowId,
    indent: getBlockIndent(source),
    parentId: source.parentId ?? null,
    props: {
      icon: alreadyCallout ? source.props.icon : DEFAULT_CALLOUT_ICON,
    },
  };

  const effects: CanvasEffect[] = [
    { type: "persist", rowId, block: calloutBlock },
  ];

  // Already a callout: keep existing children, just focus the first one.
  if (alreadyCallout) {
    const firstChild = ctx.row.children[0];
    effects.push({
      type: "focus",
      rowId: firstChild?.rowId ?? rowId,
      placement: "start",
    });
    return effects;
  }

  const text = options?.seedText ?? getTextFromBlock(source);
  const childText = buildContainerChildBlock("callout", rowId, { text });
  effects.push({
    type: "insert",
    position: { parentId: rowId, atScopeStart: true },
    block: childText,
    focus: true,
  });
  effects.push({
    type: "focus",
    rowId: childText.id,
    placement: "start",
    offset: 0,
  });
  return effects;
}

/**
 * Unwrap a callout: hoist its children to the callout's position as siblings,
 * then delete the shell. The callout owns no text of its own, so a "Turn into"
 * simply dissolves the box and keeps the nested content. Mirrors
 * `planColumnsUnwrap`.
 */
export function planCalloutUnwrap(
  rows: CanvasRow[],
  calloutRowId: string
): CanvasEffect[] {
  const ctx = findRowContext(rows, calloutRowId);
  if (ctx?.row.effectiveBlock.type !== "callout") {
    return [];
  }

  const calloutBlock = ctx.row.effectiveBlock;
  const parentId = calloutBlock.parentId ?? null;
  const children = ctx.row.children;

  // Defensive: an empty callout becomes an empty text block in place.
  if (children.length === 0) {
    return [
      {
        type: "persist",
        rowId: calloutRowId,
        block: {
          ...createEmptyBlock("text"),
          id: calloutRowId,
          indent: getBlockIndent(calloutBlock),
          parentId,
        },
      },
      { type: "focus", rowId: calloutRowId, placement: "start" },
    ];
  }

  const effects: CanvasEffect[] = [];
  const placementBase =
    resolveRowPlacementPlan(rows, calloutRowId, "before") ??
    ({ parentId, atScopeStart: true } as const);

  let anchorRowId: string | undefined;
  for (const [index, child] of children.entries()) {
    const position =
      index === 0
        ? placementBase
        : {
            parentId,
            anchorRowId: anchorRowId ?? children[0]?.rowId,
            edge: "after" as const,
          };
    effects.push({ type: "move", rowId: child.rowId, position });
    anchorRowId = child.rowId;
  }

  effects.push({ type: "delete", rowId: calloutRowId });
  effects.push({
    type: "focus",
    rowId: children[0].rowId,
    placement: "start",
  });
  return effects;
}
