import { type ReactNode, useMemo } from "react";

import "@/components/blocks/register-containers.ts";
import { BlockActionsMenuProvider } from "@/components/canvas/block-actions-menu.tsx";
import {
  type CanvasEditorActions,
  CanvasEditorContext,
} from "@/components/canvas/canvas-editor-context.tsx";
import { CanvasMenuProvider } from "@/components/canvas/canvas-menu-context.tsx";
import { CanvasRowList } from "@/components/canvas/canvas-row.tsx";
import { ReadOnlyHeadingCollapseProvider } from "@/components/canvas/heading-collapse-context.tsx";
import type { ServerPageSource } from "@/db/queries/use-page-canvas.ts";
import { buildBlockTree, type CanvasRow } from "@/lib/blocks/block-tree.ts";
import { rewriteLegacyEditorBlockIds } from "@/lib/blocks/ensure-minimum-blocks.ts";
import type { BlockMode } from "@/lib/canvas/block-spec.types.ts";
import {
  pageContentColumnClassName,
  resolveUseFullPanelCanvasWidth,
} from "@/lib/pages/page-content-layout.ts";
import { PageContentLayoutProvider } from "@/lib/pages/page-content-layout-context.tsx";
import { pageCanvasMobileScrollClassName } from "@/lib/pages/page-title-layout.ts";
import type { Block } from "@/lib/schemas/block.ts";
import { cn } from "@/lib/utils.ts";

interface CanvasBlocksReadOnlyProps {
  blocks: Block[];
  coverSlot?: ReactNode;
  fullWidth?: boolean;
  headerSlot?: ReactNode;
  isNarrowViewport?: boolean;
  /**
   * `"edit"` (default) mirrors the live editor markup so the SSR/bootstrap view
   * swaps without layout shift. `"view"` renders each block's read-only `View`
   * component (no `contentEditable`, no gutters) — used for the history preview.
   */
  mode?: BlockMode;
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
    selectRows: noop,
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
  coverSlot,
  fullWidth = false,
  headerSlot,
  isNarrowViewport = false,
  mode = "edit",
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
  const useFullPanelWidth = resolveUseFullPanelCanvasWidth({
    fullWidth,
    isNarrowViewport,
  });

  return (
    <CanvasEditorContext.Provider value={actions}>
      <CanvasMenuProvider>
        <BlockActionsMenuProvider>
          <ReadOnlyHeadingCollapseProvider>
            <PageContentLayoutProvider useFullPanelWidth={useFullPanelWidth}>
              <div className="flex flex-col max-md:flex-none md:min-h-0 md:flex-1 md:overflow-hidden">
                <div
                  className={cn(
                    // Mobile scrolls the document; desktop scrolls this inner box
                    // (`md:overflow-auto` comes from the shared scroll className).
                    "relative flex flex-col max-md:overflow-x-clip md:min-h-0 md:flex-1",
                    pageCanvasMobileScrollClassName
                  )}
                  data-scroll-restoration-id="page-canvas-scroll"
                  {...(useFullPanelWidth ? { "data-page-full-width": "" } : {})}
                >
                  {coverSlot}
                  {/* See page-canvas-editor: sticky header must not be a direct flex child. */}
                  <div className="min-w-0">
                    {headerSlot}
                    <div
                      className={pageContentColumnClassName({
                        fullWidth,
                        isNarrowViewport,
                      })}
                    >
                      {titleSlot}
                      <div className="flex flex-col gap-px overflow-visible [&>[data-canvas-row-shell]:first-child_.group/block]:pt-0 [&>[data-canvas-row-shell]:first-child_.group/list]:pt-0 [&>[data-canvas-row-shell]:first-child_[data-canvas-row-layout]]:pt-0">
                        <CanvasRowList mode={mode} rows={rows} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </PageContentLayoutProvider>
          </ReadOnlyHeadingCollapseProvider>
        </BlockActionsMenuProvider>
      </CanvasMenuProvider>
    </CanvasEditorContext.Provider>
  );
}

interface PageCanvasServerProps {
  coverSlot?: ReactNode;
  fullWidth: boolean;
  headerSlot?: ReactNode;
  isNarrowViewport: boolean;
  serverPage: ServerPageSource;
  titleSlot?: ReactNode;
}

export function PageCanvasServer({
  coverSlot,
  fullWidth,
  headerSlot,
  isNarrowViewport,
  serverPage,
  titleSlot,
}: PageCanvasServerProps) {
  return (
    <CanvasBlocksReadOnly
      blocks={serverPage.blocks}
      coverSlot={coverSlot}
      fullWidth={fullWidth}
      headerSlot={headerSlot}
      isNarrowViewport={isNarrowViewport}
      pageId={serverPage.id}
      titleSlot={titleSlot}
    />
  );
}
