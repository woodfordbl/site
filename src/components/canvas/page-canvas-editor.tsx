import type { DragEvent } from "react";
import { useCallback, useEffect, useMemo } from "react";

import { CanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import {
  CanvasMenuProvider,
  useCanvasMenu,
  useCloseBlockActionsMenuBeforeAction,
} from "@/components/canvas/canvas-menu-context.tsx";
import { CanvasMenuRoot } from "@/components/canvas/canvas-menu-root.tsx";
import { CanvasRowView } from "@/components/canvas/canvas-row.tsx";
import { PageCanvasFooter } from "@/components/canvas/page-canvas-footer.tsx";
import type { ServerPageSource } from "@/db/queries/use-page-canvas.ts";
import { useCanvasEditor } from "@/hooks/use-canvas-editor.ts";
import { useCanvasKeyboard } from "@/hooks/use-canvas-keyboard.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { handleCanvasKeyboardShortcut } from "@/lib/canvas/canvas-keyboard-shortcuts.ts";
import {
  collectCanvasRowRects,
  resolveDropTargetFromPointer,
} from "@/lib/canvas/resolve-drop-target.ts";
import { getCanvasRowDragId } from "@/lib/canvas/row-drag.ts";
import { cn } from "@/lib/utils.ts";

interface PageCanvasEditorProps {
  serverPage: ServerPageSource;
}

function BlockActionsMenuDismiss({
  clearSelection,
}: {
  clearSelection: () => void;
}) {
  const { closeMenu, open, payload } = useCanvasMenu();
  const isBlockActionsOpen = open && payload?.kind === "block-actions";

  useEffect(() => {
    if (!isBlockActionsOpen) {
      return;
    }

    const dismiss = () => {
      closeMenu();
      clearSelection();
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest("[data-canvas-row-menu]")) {
        return;
      }
      if (target.closest("[data-canvas-row-select]")) {
        return;
      }
      dismiss();
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (event.shiftKey && target.closest("[data-canvas-row-content]")) {
        return;
      }
      if (target.closest("[data-canvas-row-menu]")) {
        return;
      }
      if (target.closest("[data-canvas-row-select]")) {
        return;
      }
      dismiss();
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [clearSelection, closeMenu, isBlockActionsOpen]);

  return null;
}

type CanvasEditorState = ReturnType<typeof useCanvasEditor>;

function PageCanvasEditorBody({
  editor,
  serverPage,
}: {
  editor: CanvasEditorState;
  serverPage: ServerPageSource;
}) {
  const runAfterBlockActionsMenuClose = useCloseBlockActionsMenuBeforeAction();
  const { pages } = useMergedPageListItems();

  const deleteSelection = useCallback(() => {
    runAfterBlockActionsMenuClose(editor.deleteSelection);
  }, [editor.deleteSelection, runAfterBlockActionsMenuClose]);

  const deleteRow = useCallback(
    (rowId: string) => {
      runAfterBlockActionsMenuClose(() => editor.deleteRow(rowId));
    },
    [editor.deleteRow, runAfterBlockActionsMenuClose]
  );

  const handleCanvasKeyDown = useCallback(
    (event: KeyboardEvent) => {
      handleCanvasKeyboardShortcut(event, {
        clipboard: editor.clipboard,
        copySelection: editor.copySelection,
        deleteSelection,
        extendSelectionDown: () => editor.extendSelectionAdjacent("down"),
        extendSelectionUp: () => editor.extendSelectionAdjacent("up"),
        moveRowDown: () => editor.moveSelectedRowAdjacent("down"),
        moveRowUp: () => editor.moveSelectedRowAdjacent("up"),
        pasteClipboard: editor.pasteClipboard,
        selectAll: editor.selectAll,
        selectedCount: editor.selectedRowIds.length,
      });
    },
    [
      deleteSelection,
      editor.clipboard,
      editor.copySelection,
      editor.extendSelectionAdjacent,
      editor.moveSelectedRowAdjacent,
      editor.pasteClipboard,
      editor.selectAll,
      editor.selectedRowIds.length,
    ]
  );

  useCanvasKeyboard({
    clearSelection: editor.clearSelection,
    hasSelection: editor.selectedRowIds.length > 0,
    onKeyDown: handleCanvasKeyDown,
    onPaste: editor.handleCanvasPaste,
    selectionArrowHandlers: {
      extendSelectionDown: () => editor.extendSelectionAdjacent("down"),
      extendSelectionUp: () => editor.extendSelectionAdjacent("up"),
      moveRowDown: () => editor.moveSelectedRowAdjacent("down"),
      moveRowUp: () => editor.moveSelectedRowAdjacent("up"),
      selectedCount: editor.selectedRowIds.length,
    },
  });

  const handleCanvasDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!editor.draggingRowId) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const target = resolveDropTargetFromPointer(
        editor.rows,
        event.clientY,
        collectCanvasRowRects(),
        editor.draggingRowId
      );
      editor.setDropTarget(target);
    },
    [editor.draggingRowId, editor.rows, editor.setDropTarget]
  );

  const handleCanvasDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const sourceRowId = getCanvasRowDragId(event.dataTransfer);
      const target = resolveDropTargetFromPointer(
        editor.rows,
        event.clientY,
        collectCanvasRowRects(),
        editor.draggingRowId
      );
      editor.setDropTarget(null);
      editor.setDraggingRowId(null);
      if (!(sourceRowId && target)) {
        return;
      }
      if (target.edge === "before") {
        editor.moveBefore(sourceRowId, target.rowId);
      } else {
        editor.moveAfter(sourceRowId, target.rowId);
      }
      editor.clearSelection();
    },
    [
      editor.clearSelection,
      editor.draggingRowId,
      editor.moveAfter,
      editor.moveBefore,
      editor.rows,
      editor.setDraggingRowId,
      editor.setDropTarget,
    ]
  );

  const handleCanvasDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const related = event.relatedTarget;
      if (related instanceof Node && event.currentTarget.contains(related)) {
        return;
      }
      editor.clearDropTarget();
    },
    [editor.clearDropTarget]
  );

  const editorContextValue = useMemo(
    () => ({
      rows: editor.rows,
      dispatch: editor.dispatch,
      currentPageId: serverPage.id,
      focus: editor.focus,
      insertAfter: editor.insertAfter,
      insertAtScopeStart: editor.insertAtScopeStart,
      insertBefore: editor.insertBefore,
      moveAfter: editor.moveAfter,
      moveBefore: editor.moveBefore,
      pasteAfter: editor.pasteAfter,
      pasteBefore: editor.pasteBefore,
      clearFocus: editor.clearFocus,
      selection: editor.selection,
      selectedRowIds: editor.selectedRowIds,
      toggleRowSelection: editor.toggleRowSelection,
      selectAll: editor.selectAll,
      selectRow: editor.selectRow,
      clearSelection: editor.clearSelection,
      clearDropTarget: editor.clearDropTarget,
      dropTarget: editor.dropTarget,
      isRowSelected: editor.isRowSelected,
      copySelection: editor.copySelection,
      copyRow: editor.copyRow,
      deleteSelection,
      deleteRow,
      duplicateRow: editor.duplicateRow,
      pasteClipboard: editor.pasteClipboard,
      clipboard: editor.clipboard,
      draggingRowId: editor.draggingRowId,
      setDraggingRowId: editor.setDraggingRowId,
      setDropTarget: editor.setDropTarget,
      saveRow: editor.saveRow,
    }),
    [deleteRow, deleteSelection, editor, serverPage.id]
  );

  return (
    <CanvasEditorContext.Provider value={editorContextValue}>
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: HTML5 drag-and-drop canvas target */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: HTML5 drag-and-drop canvas target */}
      <div
        className={cn(
          editor.draggingRowId &&
            "[&_input]:pointer-events-none [&_textarea]:pointer-events-none"
        )}
        onDragLeave={handleCanvasDragLeave}
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
      >
        <div className="flex flex-col gap-px overflow-visible [&>.group/canvas-row:first-child_.group/block]:pt-0 [&>.group/canvas-row:first-child_.group/list]:pt-0">
          {editor.rows.map((row) => (
            <CanvasRowView
              autoFocus={editor.focus?.rowId === row.rowId}
              autoFocusOffset={editor.focus?.offset}
              autoFocusPlacement={editor.focus?.placement}
              key={row.rowId}
              mode="edit"
              onFocusHandled={editor.clearFocus}
              pages={pages}
              row={row}
            />
          ))}
        </div>
        <PageCanvasFooter
          hasLocalChanges={editor.hasLocalChanges}
          isStale={editor.isStale}
          onAcknowledgeStale={() =>
            editor.dispatch({ type: "page.acknowledgeServerBaseline" })
          }
          onReset={editor.resetToServer}
          onRevertToServer={() =>
            editor.dispatch({ type: "page.revertToServer" })
          }
          pageId={serverPage.id}
          pageParentId={serverPage.parentId}
          pageSlug={serverPage.slug}
          pageTitle={serverPage.title}
          rows={editor.rows}
        />
      </div>
      <BlockActionsMenuDismiss clearSelection={editor.clearSelection} />
      <CanvasMenuRoot />
    </CanvasEditorContext.Provider>
  );
}

export function PageCanvasEditor({ serverPage }: PageCanvasEditorProps) {
  const editor = useCanvasEditor(serverPage);

  return (
    <CanvasMenuProvider>
      <PageCanvasEditorBody editor={editor} serverPage={serverPage} />
    </CanvasMenuProvider>
  );
}
