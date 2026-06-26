import { type ReactNode, useMemo } from "react";

import "@/components/blocks/register-containers.ts";
import { BlockActionsMenuProvider } from "@/components/canvas/block-actions-menu.tsx";
import {
  type CanvasEditorActions,
  CanvasEditorContext,
} from "@/components/canvas/canvas-editor-context.tsx";
import { CanvasMenuProvider } from "@/components/canvas/canvas-menu-context.tsx";
import { CanvasRowView } from "@/components/canvas/canvas-row.tsx";
import type { ServerPageSource } from "@/db/queries/use-page-canvas.ts";
import { buildBlockTree, type CanvasRow } from "@/lib/blocks/block-tree.ts";
import { rewriteLegacyEditorBlockIds } from "@/lib/blocks/ensure-minimum-blocks.ts";
import type { Block } from "@/lib/schemas/block.ts";

interface CanvasBlocksReadOnlyProps {
  blocks: Block[];
  pageId: string;
  titleSlot?: ReactNode;
}

const noop = () => undefined;
const noopAsync = () => Promise.resolve(undefined);

function createNoopCanvasEditorActions(
  rows: CanvasRow[],
  currentPageId: string
): CanvasEditorActions {
  return {
    clearFocus: noop,
    clearSelection: noop,
    copyRow: noopAsync,
    copySelection: noopAsync,
    currentPageId,
    deleteRow: noop,
    deleteSelection: noop,
    dispatch: noop,
    dispatchCommands: noop,
    duplicateRow: noop,
    getRows: () => rows,
    insertAfter: noop,
    insertAtScopeStart: noop,
    insertBefore: noop,
    moveAfter: noop,
    moveBefore: noop,
    pasteAfter: noop,
    pasteBefore: noop,
    pasteClipboard: noop,
    saveRow: noop,
    selectAll: noop,
    selectRow: noop,
    toggleRowSelection: noop,
  };
}

/**
 * Read-only block renderer shared by the SSR server view and the local-first
 * bootstrap view. The markup mirrors the editor body so swapping to the live
 * editor causes no layout shift.
 */
export function CanvasBlocksReadOnly({
  blocks,
  pageId,
  titleSlot,
}: CanvasBlocksReadOnlyProps) {
  const rows = useMemo(
    () => buildBlockTree(rewriteLegacyEditorBlockIds(blocks)),
    [blocks]
  );
  const actions = useMemo(
    () => createNoopCanvasEditorActions(rows, pageId),
    [rows, pageId]
  );

  return (
    <CanvasEditorContext.Provider value={actions}>
      <CanvasMenuProvider>
        <BlockActionsMenuProvider>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div
              className="relative flex min-h-0 flex-1 flex-col overflow-auto px-12 py-12"
              data-scroll-restoration-id="page-canvas-scroll"
            >
              {titleSlot}
              <div className="flex flex-col gap-px overflow-visible [&>[data-canvas-row-shell]:first-child_.group/block]:pt-0 [&>[data-canvas-row-shell]:first-child_.group/list]:pt-0 [&>[data-canvas-row-shell]:first-child_[data-canvas-row-layout]]:pt-0">
                {rows.map((row) => (
                  <CanvasRowView key={row.rowId} mode="edit" row={row} />
                ))}
              </div>
            </div>
          </div>
        </BlockActionsMenuProvider>
      </CanvasMenuProvider>
    </CanvasEditorContext.Provider>
  );
}

interface PageCanvasServerProps {
  serverPage: ServerPageSource;
  titleSlot?: ReactNode;
}

export function PageCanvasServer({
  serverPage,
  titleSlot,
}: PageCanvasServerProps) {
  return (
    <CanvasBlocksReadOnly
      blocks={serverPage.blocks}
      pageId={serverPage.id}
      titleSlot={titleSlot}
    />
  );
}
