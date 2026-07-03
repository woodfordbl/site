import type { KeyboardEvent } from "react";

import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import type { CanvasCommand } from "@/lib/canvas/commands.ts";
import { resolveTableCellPosition } from "@/lib/canvas/table-layout.ts";

interface TableCellShortcutContext {
  cellRowId: string;
  dispatch: (command: CanvasCommand) => void;
  moveAfter: (sourceRowId: string, targetRowId: string) => void;
  moveBefore: (sourceRowId: string, targetRowId: string) => void;
  rows: CanvasRow[];
}

type TableShortcutAction =
  | { kind: "add-column" }
  | { kind: "add-row" }
  | { kind: "delete-column" }
  | { kind: "delete-row" }
  | { direction: "left" | "right"; kind: "move-column" }
  | { direction: "up" | "down"; kind: "move-row" };

function isKey(event: KeyboardEvent, code: string, ...keys: string[]): boolean {
  return event.code === code || keys.includes(event.key);
}

/**
 * Excel-style table editing combos, matched natively inside a focused cell (the
 * generic hotkey registry can't conditionally `preventDefault` only when a table
 * cell is focused). On the `=`/`-` insert/delete keys, Alt is the base and Mod
 * flips the axis to column; moves use Alt+Shift+arrows with the direction
 * picking the axis.
 */
function matchTableShortcut(event: KeyboardEvent): TableShortcutAction | null {
  const mod = event.metaKey || event.ctrlKey;
  const { altKey, shiftKey } = event;

  if (altKey && !shiftKey && isKey(event, "Equal", "=", "+")) {
    return mod ? { kind: "add-column" } : { kind: "add-row" };
  }

  if (altKey && !shiftKey && isKey(event, "Minus", "-", "_")) {
    return mod ? { kind: "delete-column" } : { kind: "delete-row" };
  }

  if (altKey && shiftKey && !mod) {
    switch (event.key) {
      case "ArrowUp":
        return { kind: "move-row", direction: "up" };
      case "ArrowDown":
        return { kind: "move-row", direction: "down" };
      case "ArrowLeft":
        return { kind: "move-column", direction: "left" };
      case "ArrowRight":
        return { kind: "move-column", direction: "right" };
      default:
        return null;
    }
  }

  return null;
}

/**
 * Returns true when the event matched a table editing shortcut (the caller
 * should then `preventDefault`). The combo is consumed even at a structural
 * boundary (e.g. moving the first row up) so the caret does not jump instead.
 */
export function handleTableCellShortcut(
  event: KeyboardEvent,
  ctx: TableCellShortcutContext
): boolean {
  const action = matchTableShortcut(event);
  if (!action) {
    return false;
  }

  const position = resolveTableCellPosition(ctx.rows, ctx.cellRowId);
  if (!position) {
    return false;
  }

  switch (action.kind) {
    case "add-row":
      ctx.dispatch({
        type: "table.addRow",
        tableRowId: position.tableRowId,
        edge: "after",
        focus: true,
      });
      return true;
    case "add-column":
      ctx.dispatch({
        type: "table.addColumn",
        tableId: position.tableId,
        columnIndex: position.columnIndex,
        edge: "after",
        focus: true,
      });
      return true;
    case "delete-row":
      ctx.dispatch({
        type: "table.removeRow",
        tableRowId: position.tableRowId,
      });
      return true;
    case "delete-column":
      ctx.dispatch({
        type: "table.removeColumn",
        tableId: position.tableId,
        columnIndex: position.columnIndex,
      });
      return true;
    case "move-row": {
      if (action.direction === "up") {
        if (position.prevRowId) {
          ctx.moveBefore(position.tableRowId, position.prevRowId);
        }
      } else if (position.nextRowId) {
        ctx.moveAfter(position.tableRowId, position.nextRowId);
      }
      return true;
    }
    case "move-column": {
      const toIndex =
        action.direction === "left"
          ? position.columnIndex - 1
          : position.columnIndex + 1;
      if (toIndex >= 0 && toIndex < position.columnCount) {
        ctx.dispatch({
          type: "table.reorderColumn",
          tableId: position.tableId,
          fromIndex: position.columnIndex,
          toIndex,
        });
      }
      return true;
    }
    default:
      return false;
  }
}
