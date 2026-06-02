import type { CanvasRow } from "@/db/queries/merge-blocks.ts";
import { getBlockIndent } from "@/lib/blocks/block-indent.ts";
import {
  placementAfterRow,
  resolveRowPlacementPlan,
} from "@/lib/blocks/row-placement.ts";
import { isContainerBlockType } from "@/lib/canvas/block-spec.types.ts";
import type { CanvasEffect } from "@/lib/canvas/effects.ts";
import type { Block } from "@/lib/schemas/block.ts";

interface ContainerChildContext {
  index: number;
  parent: CanvasRow;
  row: CanvasRow;
}

function cloneTailContainerBlock(containerBlock: Block): Block | null {
  if (!isContainerBlockType(containerBlock.type)) {
    return null;
  }

  return {
    ...containerBlock,
    id: crypto.randomUUID(),
    parentId: containerBlock.parentId ?? null,
    indent: getBlockIndent(containerBlock),
  };
}

/** Lifts a container child out (bullet → text) in place: persist, move, keep row id and focus. */
export function planLiftContainerChildConversion(
  rows: CanvasRow[],
  ctx: ContainerChildContext,
  convertedBlock: Block
): CanvasEffect[] {
  const containerRow = ctx.parent;
  const containerBlock = containerRow.effectiveBlock;
  if (!isContainerBlockType(containerBlock.type)) {
    return [];
  }

  const itemIndex = ctx.index;
  const suffixChildren = containerRow.children.slice(itemIndex + 1);
  const prefixCount = itemIndex;
  const containerRowId = containerRow.rowId;
  const rowId = ctx.row.rowId;
  const parentId = containerBlock.parentId ?? null;
  const containerPlacement =
    resolveRowPlacementPlan(rows, containerRowId, "before") ??
    ({ parentId, atScopeStart: true } as const);

  const effects: CanvasEffect[] = [];
  const tailContainerBlock =
    suffixChildren.length > 0 ? cloneTailContainerBlock(containerBlock) : null;

  if (tailContainerBlock) {
    for (const child of suffixChildren) {
      effects.push({
        type: "persist",
        rowId: child.rowId,
        block: {
          ...child.effectiveBlock,
          parentId: tailContainerBlock.id,
        },
      });
    }
  }

  effects.push({
    type: "persist",
    rowId,
    block: { ...convertedBlock, parentId },
  });

  const headContainerRemains = prefixCount > 0;
  if (!headContainerRemains) {
    effects.push({ type: "delete", rowId: containerRowId });
  }

  const convertedPlacement =
    (headContainerRemains
      ? placementAfterRow(rows, containerRowId)
      : containerPlacement) ?? containerPlacement;

  if (convertedPlacement) {
    effects.push({
      type: "move",
      rowId,
      position: convertedPlacement,
    });
    effects.push({
      type: "focus",
      rowId,
      placement: "start",
      offset: 0,
    });
  }

  if (tailContainerBlock) {
    effects.push({
      type: "insert",
      position: {
        parentId,
        anchorRowId: rowId,
        edge: "after",
      },
      block: tailContainerBlock,
      focus: false,
    });
  }

  return effects;
}
