import { getBlockIndent } from "@/lib/blocks/block-indent.ts";
import { shouldLiftEmptyContainerChildOnDelete } from "@/lib/canvas/block-interactions.ts";
import type { CanvasCommand } from "@/lib/canvas/commands.ts";
import type { StructuralContext } from "@/lib/canvas/structural-context.ts";
import { previousRowAcceptsEmptyMerge } from "@/lib/canvas/structural-context.ts";

function resolvePageLinkDelete(ctx: StructuralContext): CanvasCommand[] {
  const focusTarget = ctx.previousFocusableCanvasRow ?? ctx.nextSibling;

  return [
    { type: "row.delete", rowId: ctx.rowId },
    ...(focusTarget
      ? [
          {
            type: "focus.set" as const,
            rowId: focusTarget.rowId,
            placement: (ctx.previousFocusableCanvasRow ? "end" : "start") as
              | "start"
              | "end",
          },
        ]
      : []),
  ];
}

function resolveEmptyTopLevelDelete(ctx: StructuralContext): CanvasCommand[] {
  if (ctx.parentId) {
    return [];
  }

  if (!(ctx.previousCanvasRow || ctx.previousSibling || ctx.nextSibling)) {
    return [];
  }

  return [
    { type: "row.delete", rowId: ctx.rowId },
    ...(ctx.previousFocusableCanvasRow
      ? [
          {
            type: "focus.set" as const,
            rowId: ctx.previousFocusableCanvasRow.rowId,
            placement: "end" as const,
          },
        ]
      : []),
  ];
}

function resolveEmptyBlockActions(ctx: StructuralContext): CanvasCommand[] {
  if (getBlockIndent(ctx.block) > 0) {
    return [{ type: "indent.adjust", rowId: ctx.rowId, delta: -1 }];
  }

  if (ctx.previousSibling) {
    return [
      { type: "row.delete", rowId: ctx.rowId },
      {
        type: "focus.set",
        rowId: ctx.previousSibling.rowId,
        placement: "end",
      },
    ];
  }

  if (shouldLiftEmptyContainerChildOnDelete(ctx.parentRow)) {
    return [{ type: "block.liftAsText", rowId: ctx.rowId }];
  }

  if (
    ctx.parentRow?.effectiveBlock.type === "column" &&
    ctx.parentRow.children.length === 1
  ) {
    return [
      {
        type: "columns.removeColumn",
        columnRowId: ctx.parentRow.rowId,
      },
    ];
  }

  if (
    ctx.parentRow?.effectiveBlock.type === "tab" &&
    ctx.parentRow.children.length === 1
  ) {
    return [
      {
        type: "tabs.removeTab",
        tabRowId: ctx.parentRow.rowId,
      },
    ];
  }

  if (ctx.parentRow && ctx.parentRow.children.length === 1) {
    return [{ type: "container.unwrap", containerRowId: ctx.parentRow.rowId }];
  }

  if (!ctx.parentId && previousRowAcceptsEmptyMerge(ctx.previousCanvasRow)) {
    return [{ type: "block.mergeIntoPreviousCanvasRow", rowId: ctx.rowId }];
  }

  return resolveEmptyTopLevelDelete(ctx);
}

function resolveCaretAtStartActions(ctx: StructuralContext): CanvasCommand[] {
  if (getBlockIndent(ctx.block) > 0) {
    return [{ type: "indent.adjust", rowId: ctx.rowId, delta: -1 }];
  }

  if (ctx.previousSibling) {
    return [{ type: "block.mergeTextIntoPreviousSibling", rowId: ctx.rowId }];
  }

  if (ctx.parentId) {
    return [{ type: "block.liftAsText", rowId: ctx.rowId }];
  }

  return [];
}

export function resolveStructuralAction(
  ctx: StructuralContext
): CanvasCommand[] {
  if (ctx.block.type === "pageLink" || ctx.block.type === "divider") {
    return resolvePageLinkDelete(ctx);
  }

  if (!(ctx.caretAtStart || ctx.isEmpty)) {
    return [];
  }

  if (ctx.isEmpty) {
    return resolveEmptyBlockActions(ctx);
  }

  return resolveCaretAtStartActions(ctx);
}
