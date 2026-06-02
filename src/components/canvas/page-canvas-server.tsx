import { useMemo } from "react";
import type { CanvasEditorContextValue } from "@/components/canvas/canvas-editor-context.tsx";
import { CanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { CanvasRowView } from "@/components/canvas/canvas-row.tsx";
import { buildBlockTree, type CanvasRow } from "@/db/queries/merge-blocks.ts";
import type { ServerPageSource } from "@/db/queries/use-page-canvas.ts";
import { rewriteLegacyEditorBlockIds } from "@/lib/blocks/ensure-minimum-blocks.ts";
import { emptyBlockSelection } from "@/lib/canvas/block-selection.ts";

interface PageCanvasServerProps {
  serverPage: ServerPageSource;
}

const noop = () => undefined;
const noopAsync = async () => undefined;

function createNoopCanvasEditorContext(
  rows: CanvasRow[],
  currentPageId: string
): CanvasEditorContextValue {
  return {
    rows,
    dispatch: noop,
    currentPageId,
    focus: null,
    insertAfter: noop,
    insertAtScopeStart: noop,
    insertBefore: noop,
    moveAfter: noop,
    moveBefore: noop,
    pasteAfter: noop,
    pasteBefore: noop,
    clearFocus: noop,
    selection: emptyBlockSelection,
    selectedRowIds: [],
    toggleRowSelection: noop,
    selectAll: noop,
    selectRow: noop,
    clearSelection: noop,
    isRowSelected: () => false,
    copySelection: noopAsync,
    copyRow: noopAsync,
    deleteSelection: noop,
    deleteRow: noop,
    duplicateRow: noop,
    pasteClipboard: noop,
    clipboard: null,
    draggingRowId: null,
    setDraggingRowId: noop,
    dropTarget: null,
    setDropTarget: noop,
    clearDropTarget: noop,
    saveRow: noop,
  };
}

export function PageCanvasServer({ serverPage }: PageCanvasServerProps) {
  const rows = useMemo(
    () => buildBlockTree(rewriteLegacyEditorBlockIds(serverPage.blocks)),
    [serverPage.blocks]
  );
  const context = useMemo(
    () => createNoopCanvasEditorContext(rows, serverPage.id),
    [rows, serverPage.id]
  );

  return (
    <CanvasEditorContext.Provider value={context}>
      <div className="flex flex-col gap-px overflow-visible [&>.group/canvas-row:first-child_.group/block]:pt-0 [&>.group/canvas-row:first-child_.group/list]:pt-0">
        {rows.map((row) => (
          <CanvasRowView
            key={row.rowId}
            mode="view"
            onFocusHandled={noop}
            row={row}
          />
        ))}
      </div>
    </CanvasEditorContext.Provider>
  );
}
