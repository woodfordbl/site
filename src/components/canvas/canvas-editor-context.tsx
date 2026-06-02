import { createContext, useContext } from "react";
import type { CanvasRow } from "@/db/queries/merge-blocks.ts";
import type { RowInsertOptions } from "@/hooks/use-canvas-row-actions.ts";
import type { BlockSelectionState } from "@/lib/canvas/block-selection.ts";
import type { CanvasClipboardPayload } from "@/lib/canvas/clipboard.ts";
import type { CanvasCommand } from "@/lib/canvas/commands.ts";
import type { FocusState } from "@/lib/canvas/effects.ts";
import type { DropTarget } from "@/lib/canvas/resolve-drop-target.ts";
import type { Block } from "@/lib/schemas/block.ts";

export interface CanvasEditorContextValue {
  clearDropTarget: () => void;
  clearFocus: () => void;
  clearSelection: () => void;
  clipboard: CanvasClipboardPayload | null;
  copyRow: (rowId: string) => Promise<void>;
  copySelection: () => Promise<void>;
  currentPageId: string;
  deleteRow: (rowId: string) => void;
  deleteSelection: () => void;
  dispatch: (command: CanvasCommand) => void;
  draggingRowId: string | null;
  dropTarget: DropTarget | null;
  duplicateRow: (rowId: string) => void;
  focus: FocusState;
  insertAfter: (rowId: string, options?: RowInsertOptions) => void;
  insertAtScopeStart: (
    parentId: string | null,
    options?: RowInsertOptions
  ) => void;
  insertBefore: (rowId: string, options?: RowInsertOptions) => void;
  isRowSelected: (rowId: string) => boolean;
  moveAfter: (sourceRowId: string, targetRowId: string) => void;
  moveBefore: (sourceRowId: string, targetRowId: string) => void;
  pasteAfter: (targetRowId: string, blocks: Block[]) => void;
  pasteBefore: (targetRowId: string, blocks: Block[]) => void;
  pasteClipboard: () => void;
  rows: CanvasRow[];
  saveRow: (row: CanvasRow, block: Block) => void;
  selectAll: () => void;
  selectedRowIds: string[];
  selection: BlockSelectionState;
  selectRow: (rowId: string) => void;
  setDraggingRowId: (rowId: string | null) => void;
  setDropTarget: (target: DropTarget | null) => void;
  toggleRowSelection: (
    rowId: string,
    modifiers?: { metaKey?: boolean; shiftKey?: boolean }
  ) => void;
}

export const CanvasEditorContext =
  createContext<CanvasEditorContextValue | null>(null);

export function useCanvasEditorContext(): CanvasEditorContextValue {
  const ctx = useContext(CanvasEditorContext);
  if (!ctx) {
    throw new Error("useCanvasEditorContext requires CanvasEditorProvider");
  }
  return ctx;
}
