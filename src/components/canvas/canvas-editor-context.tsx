import { createContext, useContext } from "react";
import type { RowInsertOptions } from "@/hooks/use-canvas-row-actions.ts";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import type { BlockSelectionState } from "@/lib/canvas/block-selection.ts";
import { emptyBlockSelection } from "@/lib/canvas/block-selection.ts";
import type { CanvasClipboardPayload } from "@/lib/canvas/clipboard.ts";
import type { CanvasCommand } from "@/lib/canvas/commands.ts";
import type { FocusState } from "@/lib/canvas/effects.ts";
import type { Block } from "@/lib/schemas/block.ts";

/**
 * Canvas editor context is split by volatility so a keystroke does not
 * invalidate every row:
 * - {@link CanvasEditorActionsContext}: identity-stable callbacks — safe for
 *   any component, never causes re-renders.
 * - {@link CanvasSelectionContext}: changes only when block selection changes.
 * - {@link CanvasFocusContext}: changes only when the pending focus request changes.
 * - {@link CanvasEditorStateContext}: rows + clipboard — changes per edit;
 *   consumed only by menu surfaces, never by per-row components.
 *
 * Callbacks read live rows via `getRows()` instead of closing over them.
 */
export interface CanvasEditorActions {
  clearFocus: () => void;
  clearSelection: () => void;
  copyRow: (rowId: string) => Promise<void>;
  copySelection: () => Promise<void>;
  currentPageId: string;
  deleteRow: (rowId: string) => void;
  deleteSelection: () => void;
  dispatch: (command: CanvasCommand) => void;
  dispatchCommands: (commands: CanvasCommand[]) => void;
  duplicateRow: (rowId: string) => void;
  /** Live row tree for event-time reads (structural context, placements). */
  getRows: () => CanvasRow[];
  insertAfter: (rowId: string, options?: RowInsertOptions) => void;
  insertAtScopeStart: (
    parentId: string | null,
    options?: RowInsertOptions
  ) => void;
  insertBefore: (rowId: string, options?: RowInsertOptions) => void;
  moveAfter: (sourceRowId: string, targetRowId: string) => void;
  moveBefore: (sourceRowId: string, targetRowId: string) => void;
  pasteAfter: (targetRowId: string, blocks: Block[]) => void;
  pasteBefore: (targetRowId: string, blocks: Block[]) => void;
  pasteClipboard: () => void;
  saveRow: (row: CanvasRow, block: Block) => void;
  selectAll: () => void;
  selectRow: (rowId: string) => void;
  /** Replace the whole selection (marquee drag-select), document-order ids. */
  selectRows: (rowIds: string[]) => void;
  toggleRowSelection: (
    rowId: string,
    modifiers?: { metaKey?: boolean; shiftKey?: boolean }
  ) => void;
}

export const CanvasEditorContext = createContext<CanvasEditorActions | null>(
  null
);

export function useCanvasEditorContext(): CanvasEditorActions {
  const ctx = useContext(CanvasEditorContext);
  if (!ctx) {
    throw new Error("useCanvasEditorContext requires CanvasEditorProvider");
  }
  return ctx;
}

export interface CanvasSelectionValue {
  isRowSelected: (rowId: string) => boolean;
  selectedRowIds: string[];
  selection: BlockSelectionState;
}

const noRowSelected = () => false;

export const CanvasSelectionContext = createContext<CanvasSelectionValue>({
  isRowSelected: noRowSelected,
  selectedRowIds: [],
  selection: emptyBlockSelection,
});

export function useCanvasSelection(): CanvasSelectionValue {
  return useContext(CanvasSelectionContext);
}

export const CanvasFocusContext = createContext<FocusState>(null);

export function useCanvasFocus(): FocusState {
  return useContext(CanvasFocusContext);
}

export interface CanvasEditorStateValue {
  clipboard: CanvasClipboardPayload | null;
  rows: CanvasRow[];
}

export const CanvasEditorStateContext = createContext<CanvasEditorStateValue>({
  clipboard: null,
  rows: [],
});

export function useCanvasEditorState(): CanvasEditorStateValue {
  return useContext(CanvasEditorStateContext);
}
