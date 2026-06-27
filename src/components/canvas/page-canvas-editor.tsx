import {
  type ReactNode,
  type RefObject,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

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
import { MobileBlockActionsDrawer } from "@/components/canvas/mobile-block-actions-drawer.tsx";
import { MobileEditorToolbar } from "@/components/canvas/mobile-editor-toolbar.tsx";
import { CanvasRowDndBridge } from "@/components/dnd/canvas-row-dnd-bridge.tsx";
import {
  CanvasRowDragPreview,
  type CanvasRowDragPreviewState,
} from "@/components/dnd/canvas-row-drag-preview.tsx";
import {
  DndSurface,
  type DndSurfaceConfig,
} from "@/components/dnd/dnd-surface.tsx";
import { DragOverlay } from "@/components/dnd/drag-overlay.tsx";
import { useDragState, useDropZone } from "@/components/dnd/use-dnd.ts";
import type { ServerPageSource } from "@/db/queries/use-page-canvas.ts";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import { useCanvasEditor } from "@/hooks/use-canvas-editor.ts";
import { useCanvasKeyboard } from "@/hooks/use-canvas-keyboard.ts";
import { useCanvasOverclick } from "@/hooks/use-canvas-overclick.ts";
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { usePageReposition } from "@/hooks/use-page-reposition.ts";
import { handleCanvasKeyboardShortcut } from "@/lib/canvas/canvas-keyboard-shortcuts.ts";
import {
  CANVAS_ROW_ATTRIBUTE,
  collectCanvasRowRects,
  type DropTarget,
  resolveDropTargetFromPointer,
  resolveTopLevelInsertEdge,
} from "@/lib/canvas/resolve-drop-target.ts";
import { resolveCanvasRowDragPreviewNode } from "@/lib/dnd/canvas-row-drag-image.ts";
import { createDragChannel } from "@/lib/dnd/drag-channel.ts";
import { cloneNodeWithFieldValues } from "@/lib/dnd/drag-image.ts";
import {
  canDropPageIntoCanvas,
  PAGE_DRAG_MIME_TYPE,
} from "@/lib/pages/page-canvas-drop.ts";
import {
  pageCanvasMobileScrollClassName,
  pageCanvasTouchScrollClassName,
} from "@/lib/pages/page-title-layout.ts";
import { cn } from "@/lib/utils.ts";

interface PageCanvasEditorProps {
  /** Rendered flush at the top of the scroll region so it scrolls with content (mobile header). */
  headerSlot?: ReactNode;
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

function CanvasOverclickListener({
  scrollRootRef,
}: {
  scrollRootRef: RefObject<HTMLElement | null>;
}) {
  useCanvasOverclick(scrollRootRef);
  return null;
}

function PageCanvasEditorBody({
  editor,
  headerSlot,
  serverPage,
  titleSlot,
}: {
  editor: CanvasEditorState;
  headerSlot?: ReactNode;
  serverPage: ServerPageSource;
  titleSlot?: ReactNode;
}) {
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const isCoarsePrimaryPointer = useIsCoarsePrimaryPointer();
  const runAfterBlockActionsMenuClose = useCloseBlockActionsMenuBeforeAction();
  const { pages } = useMergedPageListItems();
  const dispatchPage = usePageDispatch(pages);
  const repositionPage = usePageReposition(pages, dispatchPage);
  const currentPageId = serverPage.id;

  // Dragging a sidebar page onto the canvas inserts a child pageLink at the drop
  // position and re-nests the page under this one (cycle/depth guarded). The
  // reposition uses appendPageLinkOnParent:false because we place the link
  // ourselves. @see docs/architecture/pages.md
  const handleDropPageIntoCanvas = useCallback(
    (droppedPageId: string, clientY: number) => {
      if (!canDropPageIntoCanvas({ currentPageId, droppedPageId, pages })) {
        return;
      }

      const target = resolveTopLevelInsertEdge(
        editor.getRows(),
        clientY,
        collectCanvasRowRects()
      );
      if (target) {
        const insertOptions = {
          blockType: "pageLink" as const,
          pageId: droppedPageId,
          pageLinkVariant: "child" as const,
        };
        if (target.edge === "before") {
          editor.insertBefore(target.rowId, insertOptions);
        } else {
          editor.insertAfter(target.rowId, insertOptions);
        }
      }

      repositionPage({
        appendPageLinkOnParent: false,
        pageId: droppedPageId,
        parentId: currentPageId,
      });
    },
    [currentPageId, editor, pages, repositionPage]
  );

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
  const [canvasRowPreview, setCanvasRowPreview] =
    useState<CanvasRowDragPreviewState | null>(null);
  // Touch grabs the left gutter, which sits outside the row content rects, so
  // X hit-testing would never match a row. Nudge X into the content column for
  // pointer (touch) drags only — native (mouse) drags keep their true X.
  const pointerDragActiveRef = useRef(false);

  const dndConfig = useMemo<DndSurfaceConfig<DropTarget>>(
    () => ({
      channel: canvasRowChannel,
      rowAttribute: CANVAS_ROW_ATTRIBUTE,
      resolveDropTarget: ({ sourceId, pointer, rects }) => {
        let x = pointer.x;
        if (pointerDragActiveRef.current && rects.size > 0) {
          let minLeft = Number.POSITIVE_INFINITY;
          let maxRight = Number.NEGATIVE_INFINITY;
          for (const rect of rects.values()) {
            minLeft = Math.min(minLeft, rect.left);
            maxRight = Math.max(maxRight, rect.right);
          }
          x = Math.min(Math.max(x, minLeft + 1), maxRight - 1);
        }
        return resolveDropTargetFromPointer(
          editor.getRows(),
          x,
          pointer.y,
          rects,
          sourceId
        );
      },
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
      onDragStart: ({ sourceId, pointer, pointerDrag }) => {
        pointerDragActiveRef.current = pointerDrag;
        if (isTableRowDragSource(sourceId)) {
          setTableRowPreviewMeta(measureTableRowDragPreview(sourceId, pointer));
          return;
        }
        // Native (mouse) drags use the browser drag image; only the pointer
        // (touch) path needs a React-rendered follow-the-pointer preview.
        if (!pointerDrag) {
          return;
        }
        const node = resolveCanvasRowDragPreviewNode(sourceId);
        if (!node) {
          return;
        }
        const rect = node.getBoundingClientRect();
        setCanvasRowPreview({
          node: cloneNodeWithFieldValues(node),
          offsetX: pointer.x - rect.left,
          offsetY: pointer.y - rect.top,
          width: rect.width,
        });
      },
      onDragEnd: () => {
        pointerDragActiveRef.current = false;
        setTableRowPreviewMeta(null);
        setCanvasRowPreview(null);
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

  return (
    <CanvasEditorContext.Provider value={actions}>
      <CanvasSelectionContext.Provider value={selectionValue}>
        <CanvasFocusContext.Provider value={editor.focus}>
          <CanvasEditorStateContext.Provider value={stateValue}>
            <CanvasSlashProvider pages={pages}>
              <CanvasOverclickListener scrollRootRef={scrollRootRef} />
              <DndSurface config={dndConfig}>
                <DragOverlay>
                  {({ pointer }) => {
                    if (tableRowPreviewMeta) {
                      return (
                        <TableRowDragPreview
                          preview={{
                            ...tableRowPreviewMeta,
                            clientX: pointer.x,
                            clientY: pointer.y,
                          }}
                        />
                      );
                    }
                    if (canvasRowPreview) {
                      return (
                        <CanvasRowDragPreview
                          pointer={pointer}
                          preview={canvasRowPreview}
                        />
                      );
                    }
                    return null;
                  }}
                </DragOverlay>
                <CanvasRowDndBridge>
                  <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div
                      className={cn(
                        "relative flex min-h-0 flex-1 flex-col",
                        isCoarsePrimaryPointer
                          ? pageCanvasTouchScrollClassName
                          : pageCanvasMobileScrollClassName
                      )}
                      data-scroll-restoration-id="page-canvas-scroll"
                      ref={scrollRootRef}
                    >
                      {headerSlot}
                      {titleSlot}
                      <CanvasDropZone onDropPage={handleDropPageIntoCanvas}>
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
                    <MobileBlockActionsDrawer />
                    <MobileEditorToolbar />
                  </div>
                </CanvasRowDndBridge>
              </DndSurface>
            </CanvasSlashProvider>
          </CanvasEditorStateContext.Provider>
        </CanvasFocusContext.Provider>
      </CanvasSelectionContext.Provider>
    </CanvasEditorContext.Provider>
  );
}

function isPageDrag(event: React.DragEvent<HTMLDivElement>): boolean {
  return Array.from(event.dataTransfer.types).includes(PAGE_DRAG_MIME_TYPE);
}

function CanvasDropZone({
  children,
  onDropPage,
}: {
  children: ReactNode;
  onDropPage: (pageId: string, clientY: number) => void;
}) {
  const { getDropZoneProps } = useDropZone();
  const isDragging = useDragState((state) => state.draggingId != null);
  const [pageDragOver, setPageDragOver] = useState(false);
  const zone = getDropZoneProps();

  // Compose the canvas-row drop zone with cross-surface sidebar page drops.
  // Spread (not inline) so the a11y "no handlers on static element" rule — which
  // the bare drop zone already opts out of via spreading — stays satisfied.
  const dropZoneProps = {
    onDragLeave: (event: React.DragEvent<HTMLDivElement>) => {
      if (!isPageDrag(event)) {
        zone.onDragLeave(event);
        return;
      }
      const next = event.relatedTarget;
      if (next instanceof Node && event.currentTarget.contains(next)) {
        return;
      }
      setPageDragOver(false);
    },
    onDragOver: (event: React.DragEvent<HTMLDivElement>) => {
      if (!isPageDrag(event)) {
        zone.onDragOver(event);
        return;
      }
      // A sidebar page is being dragged in — accept it as a child-page drop.
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      if (!pageDragOver) {
        setPageDragOver(true);
      }
    },
    onDrop: (event: React.DragEvent<HTMLDivElement>) => {
      if (!isPageDrag(event)) {
        zone.onDrop(event);
        return;
      }
      event.preventDefault();
      setPageDragOver(false);
      const pageId = event.dataTransfer.getData(PAGE_DRAG_MIME_TYPE);
      if (pageId) {
        onDropPage(pageId, event.clientY);
      }
    },
  };

  return (
    <div
      className={cn(
        // Fill the scroll area so the empty space below the last block is still a
        // drop target (native dragover only fires over the drop-zone element).
        "flex-1",
        isDragging &&
          "cursor-grabbing [&_input]:pointer-events-none [&_textarea]:pointer-events-none",
        pageDragOver && "rounded-lg ring-2 ring-selection-primary ring-inset"
      )}
      data-canvas-drop-zone
      {...dropZoneProps}
    >
      {children}
    </div>
  );
}

export function PageCanvasEditor({
  headerSlot,
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
          headerSlot={headerSlot}
          serverPage={serverPage}
          titleSlot={titleSlot}
        />
      </BlockActionsMenuProvider>
    </CanvasMenuProvider>
  );
}
