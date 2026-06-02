import type { CanvasRow } from "@/db/queries/merge-blocks.ts";
import { findRowContext } from "@/db/queries/merge-blocks.ts";
import { isContainerBlockType } from "@/lib/canvas/block-spec.types.ts";
import type { FocusState } from "@/lib/canvas/effects.ts";
import {
  findCanvasTextField,
  focusFieldAtPlacement,
  focusFieldAtSelection,
} from "@/lib/editor/caret-navigation.ts";
import { getBlockParentId } from "@/lib/schemas/block.ts";

/** Wait until a top-level block is no longer rendered under a list container row. */
export function shouldDeferCanvasFocus(
  rows: CanvasRow[],
  rowId: string
): boolean {
  const ctx = findRowContext(rows, rowId);
  if (!ctx) {
    return true;
  }

  if (getBlockParentId(ctx.row.effectiveBlock) !== null) {
    return false;
  }

  return (
    ctx.parent !== null && isContainerBlockType(ctx.parent.effectiveBlock.type)
  );
}

export function tryApplyCanvasFocus(
  rows: CanvasRow[],
  focus: NonNullable<FocusState>
): boolean {
  if (shouldDeferCanvasFocus(rows, focus.rowId)) {
    return false;
  }

  const shell = document.querySelector(
    `[data-canvas-row-id="${CSS.escape(focus.rowId)}"]`
  );
  if (!shell) {
    return false;
  }

  const field = findCanvasTextField(shell);
  if (!field) {
    return false;
  }

  if (focus.offset === undefined) {
    focusFieldAtPlacement(field, focus.placement ?? "start");
  } else {
    focusFieldAtSelection(field, { start: focus.offset, end: focus.offset });
  }

  return true;
}
