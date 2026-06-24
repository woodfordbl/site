import { type ReactNode, useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import "@/components/blocks/register-containers.ts";
import {
  measureTableRowDragPreview,
  TableRowDragPreview,
  type TableRowDragPreviewState,
} from "@/components/blocks/types/table/table-row-drag-preview.tsx";
import {
  BlockActionsMenuProvider,
  useCloseBlockActionsMenuBeforeAction,
} from "@/components/canvas/block-actions-menu.tsx";
import {
  type CanvasEditorActions,
  CanvasEditorContext,
  CanvasEditorStateContext,
  CanvasFocusContext,
  CanvasSelectionContext,
} from "@/components/canvas/canvas-editor-context.tsx";
import { CanvasMenuProvider } from "@/components/canvas/canvas-menu-context.tsx";
import { CanvasMenuRoot } from "@/components/canvas/canvas-menu-root.tsx";
import { CanvasRowView } from "@/components/canvas/canvas-row.tsx";
import { CanvasSlashProvider } from "@/components/canvas/canvas-slash-context.tsx";
import { PageCanvasFooter } from "@/components/canvas/page-canvas-footer.tsx";
import { CanvasRowDndBridge } from "@/components/dnd/canvas-row-dnd-bridge.tsx";
import {
  DndSurface,
  type DndSurfaceConfig,
} from "@/components/dnd/dnd-surface.tsx";
import { DragOverlay } from "@/components/dnd/drag-overlay.tsx";
import { useDragState, useDropZone } from "@/components/dnd/use-dnd.ts";
import type { ServerPageSource } from "@/db/queries/use-page-canvas.ts";
import { useCanvasEditor } from "@/hooks/use-canvas-editor.ts";
import { useCanvasKeyboard } from "@/hooks/use-canvas-keyboard.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { handleCanvasKeyboardShortcut } from "@/lib/canvas/canvas-keyboard-shortcuts.ts";
import {
  CANVAS_ROW_ATTRIBUTE,
  type DropTarget,
  resolveDropTargetFromPointer,
} from "@/lib/canvas/resolve-drop-target.ts";
import { resolveCanvasRowDragPreviewNode } from "@/lib/dnd/canvas-row-drag-image.ts";
import { createDragChannel } from "@/lib/dnd/drag-channel.ts";
import { cn } from "@/lib/utils.ts";

interface PageCanvasEditorProps {
  footerHost?: HTMLElement | null;
  pageHasLocalDraft: boolean;
  serverPage: ServerPageSource;
  titleSlot?: ReactNode;
}

/** HTML5 drag channel for canvas rows. */
const canvasRowChannel = createDragChannel("application/x-canvas-row-id");

function isTableRowDragSource(sourceId: string): boolean {
  return (
    document.querySelector(
      `[data-table-row-id="${CSS.escape(sourceId)}"]`
    ) instanceof HTMLElement
  );
}

type CanvasEditorState = ReturnType<typeof useCanvasEditor>;

function PageCanvasEditorBody({
  editor,
  footerHost,
  serverPage,
  titleSlot,
}: {
  editor: CanvasEditorState;
  footerHost?: HTMLElement | null;
  serverPage: ServerPageSource;
  titleSlot?: ReactNode;
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

  const [tableRowPreviewMeta, setTableRowPreviewMeta] = useState<Omit<
    TableRowDragPreviewState,
    "clientX" | "clientY"
  > | null>(null);

  const dndConfig = useMemo<DndSurfaceConfig<DropTarget>>(
    () => ({
      channel: canvasRowChannel,
      rowAttribute: CANVAS_ROW_ATTRIBUTE,
      resolveDropTarget: ({ sourceId, pointer, rects }) =>
        resolveDropTargetFromPointer(
          editor.getRows(),
          pointer.x,
          pointer.y,
          rects,
          sourceId
        ),
      onDrop: ({ sourceId, target }) => {
        if (target.atScopeStart) {
          editor.dispatch({
            type: "row.moveToPosition",
            rowId: sourceId,
            position: { parentId: target.rowId, atScopeStart: true },
          });
        } else if (target.edge === "before") {
          editor.moveBefore(sourceId, target.rowId);
        } else {
          editor.moveAfter(sourceId, target.rowId);
        }
        editor.clearSelection();
      },
      resolveDragImage: (sourceId) => {
        if (isTableRowDragSource(sourceId)) {
          return { kind: "overlay" };
        }
        return {
          kind: "native-clone",
          getNode: resolveCanvasRowDragPreviewNode,
        };
      },
      onDragStart: ({ sourceId, pointer }) => {
        if (!isTableRowDragSource(sourceId)) {
          return;
        }
        setTableRowPreviewMeta(measureTableRowDragPreview(sourceId, pointer));
      },
      onDragEnd: () => {
        setTableRowPreviewMeta(null);
      },
    }),
    [
      editor.clearSelection,
      editor.dispatch,
      editor.getRows,
      editor.moveAfter,
      editor.moveBefore,
    ]
  );

  const actions = useMemo<CanvasEditorActions>(
    () => ({
      clearFocus: editor.clearFocus,
      clearSelection: editor.clearSelection,
      copyRow: editor.copyRow,
      copySelection: editor.copySelection,
      currentPageId: serverPage.id,
      deleteRow,
      deleteSelection,
      dispatch: editor.dispatch,
      dispatchCommands: editor.dispatchCommands,
      duplicateRow: editor.duplicateRow,
      getRows: editor.getRows,
      insertAfter: editor.insertAfter,
      insertAtScopeStart: editor.insertAtScopeStart,
      insertBefore: editor.insertBefore,
      moveAfter: editor.moveAfter,
      moveBefore: editor.moveBefore,
      pasteAfter: editor.pasteAfter,
      pasteBefore: editor.pasteBefore,
      pasteClipboard: editor.pasteClipboard,
      saveRow: editor.saveRow,
      selectAll: editor.selectAll,
      selectRow: editor.selectRow,
      toggleRowSelection: editor.toggleRowSelection,
    }),
    [
      deleteRow,
      deleteSelection,
      editor.clearFocus,
      editor.clearSelection,
      editor.copyRow,
      editor.copySelection,
      editor.dispatch,
      editor.dispatchCommands,
      editor.duplicateRow,
      editor.getRows,
      editor.insertAfter,
      editor.insertAtScopeStart,
      editor.insertBefore,
      editor.moveAfter,
      editor.moveBefore,
      editor.pasteAfter,
      editor.pasteBefore,
      editor.pasteClipboard,
      editor.saveRow,
      editor.selectAll,
      editor.selectRow,
      editor.toggleRowSelection,
      serverPage.id,
    ]
  );

  const selectionValue = useMemo(
    () => ({
      isRowSelected: editor.isRowSelected,
      selectedRowIds: editor.selectedRowIds,
      selection: editor.selection,
    }),
    [editor.isRowSelected, editor.selectedRowIds, editor.selection]
  );

  const stateValue = useMemo(
    () => ({ clipboard: editor.clipboard, rows: editor.rows }),
    [editor.clipboard, editor.rows]
  );

  const footer = (
    <PageCanvasFooter
      hasLocalChanges={editor.hasLocalChanges}
      isStale={editor.isStale}
      onAcknowledgeStale={() =>
        editor.dispatch({ type: "page.acknowledgeServerBaseline" })
      }
      onReset={editor.resetToServer}
      onRevertToServer={() => editor.dispatch({ type: "page.revertToServer" })}
      pageIcon={serverPage.icon}
      pageId={serverPage.id}
      pageParentId={serverPage.parentId}
      pageSlug={serverPage.slug}
      pageTitle={serverPage.title}
      rows={editor.rows}
    />
  );

  return (
    <CanvasEditorContext.Provider value={actions}>
      <CanvasSelectionContext.Provider value={selectionValue}>
        <CanvasFocusContext.Provider value={editor.focus}>
          <CanvasEditorStateContext.Provider value={stateValue}>
            <CanvasSlashProvider pages={pages}>
              <DndSurface config={dndConfig}>
                <DragOverlay>
                  {({ pointer }) =>
                    tableRowPreviewMeta ? (
                      <TableRowDragPreview
                        preview={{
                          ...tableRowPreviewMeta,
                          clientX: pointer.x,
                          clientY: pointer.y,
                        }}
                      />
                    ) : null
                  }
                </DragOverlay>
                <CanvasRowDndBridge>
                  <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div
                      className="relative flex min-h-0 flex-1 flex-col overflow-auto px-12 py-12"
                      data-scroll-restoration-id="page-canvas-scroll"
                    >
                      {titleSlot}
                      <CanvasDropZone>
                        <div className="flex flex-col gap-px overflow-visible [&>[data-canvas-row-shell]:first-child_.group/block]:pt-0 [&>[data-canvas-row-shell]:first-child_.group/list]:pt-0 [&>[data-canvas-row-shell]:first-child_[data-canvas-row-layout]]:pt-0">
                          {editor.rows.map((row) => (
                            <CanvasRowView
                              key={row.rowId}
                              mode="edit"
                              row={row}
                            />
                          ))}
                        </div>
                      </CanvasDropZone>
                    </div>
                    <CanvasMenuRoot />
                  </div>
                </CanvasRowDndBridge>
              </DndSurface>
              {footerHost ? createPortal(footer, footerHost) : null}
            </CanvasSlashProvider>
          </CanvasEditorStateContext.Provider>
        </CanvasFocusContext.Provider>
      </CanvasSelectionContext.Provider>
    </CanvasEditorContext.Provider>
  );
}

function CanvasDropZone({ children }: { children: ReactNode }) {
  const { getDropZoneProps } = useDropZone();
  const isDragging = useDragState((state) => state.draggingId != null);

  return (
    <div
      className={cn(
        // Fill the scroll area so the empty space below the last block is still a
        // drop target (native dragover only fires over the drop-zone element).
        "flex-1",
        isDragging &&
          "cursor-grabbing [&_input]:pointer-events-none [&_textarea]:pointer-events-none"
      )}
      {...getDropZoneProps()}
    >
      {children}
    </div>
  );
}

export function PageCanvasEditor({
  footerHost,
  pageHasLocalDraft,
  serverPage,
  titleSlot,
}: PageCanvasEditorProps) {
  const editor = useCanvasEditor(serverPage, pageHasLocalDraft);

  return (
    <CanvasMenuProvider>
      <BlockActionsMenuProvider>
        <PageCanvasEditorBody
          editor={editor}
          footerHost={footerHost}
          serverPage={serverPage}
          titleSlot={titleSlot}
        />
      </BlockActionsMenuProvider>
    </CanvasMenuProvider>
  );
}
