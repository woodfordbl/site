import { useRouteContext } from "@tanstack/react-router";
import {
  cloneElement,
  isValidElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  DndSurface,
  type DndSurfaceConfig,
} from "@/components/dnd/dnd-surface.tsx";
import { DragOverlay } from "@/components/dnd/drag-overlay.tsx";
import { useDropZone } from "@/components/dnd/use-dnd.ts";
import {
  PageListDragPreview,
  type PageListDragPreviewState,
} from "@/components/pages/page-list-drag-preview.tsx";
import { useTemplatePage } from "@/components/pages/template-page-provider.tsx";
import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar.tsx";
import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { useActivePageRef } from "@/hooks/use-active-page-ref.ts";
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { hashPageBlocks } from "@/lib/content/block-hash.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { loadPage } from "@/lib/content/load-page.ts";
import { createDragChannel } from "@/lib/dnd/drag-channel.ts";
import {
  buildPageTree,
  getAncestorPageIds,
  type PageRow,
} from "@/lib/pages/build-page-tree.ts";
import { flattenVisiblePageRows } from "@/lib/pages/flatten-visible-page-rows.ts";
import { PAGE_DRAG_MIME_TYPE } from "@/lib/pages/page-canvas-drop.ts";
import {
  readPageListExpandedIdsFromDocument,
  writePageListExpandedIdsToDocument,
} from "@/lib/pages/page-list-expanded-cookie.ts";
import { pageListRowPaddingLeft } from "@/lib/pages/page-list-preview-depth.ts";
import type { PageMetadataSeed } from "@/lib/pages/persist-page-metadata.ts";
import { planPageReposition } from "@/lib/pages/reposition-page.ts";
import {
  dropTargetToRepositionCommand,
  PAGE_LIST_ROW_ATTRIBUTE,
  type PageListDropTarget,
  resolvePageListDropTargetFromPointer,
} from "@/lib/pages/resolve-page-list-drop-target.ts";
import { cn } from "@/lib/utils.ts";

import { NewPageButton } from "./new-page-button.tsx";
import { PageListItem } from "./page-list-item.tsx";

/** HTML5 drag channel for sidebar page rows. */
const pageDragChannel = createDragChannel(PAGE_DRAG_MIME_TYPE);

function findPageById(
  pages: PageSummary[],
  pageId: string
): PageSummary | undefined {
  return pages.find((page) => page.id === pageId);
}

function hasLocalPageDocument(pageId: string): boolean {
  return localPagesCollection.toArray.some(
    (localPage) => localPage.id === pageId && localPage.deletedAt == null
  );
}

function PageListTree({
  tree,
  pages,
  expandedIds,
  navRef,
  onToggleExpand,
  renderItem,
}: {
  tree: PageRow[];
  pages: PageSummary[];
  expandedIds: Set<string>;
  navRef?: React.RefObject<HTMLElement | null>;
  onToggleExpand: (pageId: string) => void;
  renderItem: (props: {
    depth: number;
    expandedIds: Set<string>;
    onToggleExpand: (pageId: string) => void;
    pages: PageSummary[];
    row: PageRow;
  }) => ReactNode;
}) {
  const { getDropZoneProps } = useDropZone();

  return (
    <nav
      aria-label="Pages"
      className="space-y-1"
      ref={navRef}
      {...getDropZoneProps()}
    >
      <SidebarMenu className="gap-y-px">
        {tree.map((row) => {
          const node = renderItem({
            depth: 0,
            expandedIds,
            onToggleExpand,
            pages,
            row,
          });
          return isValidElement(node)
            ? cloneElement(node, { key: row.page.id })
            : node;
        })}
        <NewPageButton />
      </SidebarMenu>
    </nav>
  );
}

function PageListContent({
  initialExpandedIds,
  pages,
}: {
  /** SSR-known expand state (from the cookie) so the SSR tree matches the hydrated tree. */
  initialExpandedIds?: readonly string[];
  pages: PageSummary[];
}) {
  const activePage = useActivePageRef();
  const dispatch = usePageDispatch(pages);
  const { templatePageId } = useTemplatePage();
  // The template page is configured in Settings and hidden from the sidebar; it
  // stays in `pages` so dispatch/reposition still resolve it normally.
  const tree = useMemo(
    () =>
      buildPageTree(
        templatePageId
          ? pages.filter((page) => page.id !== templatePageId)
          : pages
      ),
    [pages, templatePageId]
  );
  // Always seed from the SSR-known cookie prop so the server and first client
  // render match exactly; the live cookie is re-read on mount for cross-tab sync.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(initialExpandedIds)
  );
  const [previewMeta, setPreviewMeta] = useState<Omit<
    PageListDragPreviewState,
    "clientX" | "clientY"
  > | null>(null);
  const navRef = useRef<HTMLElement | null>(null);

  const requiredAncestorIds = useMemo(() => {
    const currentPage = activePage.pageId
      ? findPageById(pages, activePage.pageId)
      : undefined;

    if (!currentPage) {
      return new Set<string>();
    }

    return new Set(getAncestorPageIds(currentPage.id, pages));
  }, [activePage.pageId, pages]);

  const effectiveExpandedIds = useMemo(() => {
    const merged = new Set(expandedIds);
    for (const pageId of requiredAncestorIds) {
      merged.add(pageId);
    }
    return merged;
  }, [expandedIds, requiredAncestorIds]);

  const visibleRows = useMemo(
    () => flattenVisiblePageRows(tree, effectiveExpandedIds),
    [effectiveExpandedIds, tree]
  );

  useEffect(() => {
    setExpandedIds(readPageListExpandedIdsFromDocument());
  }, []);

  useEffect(() => {
    const knownPageIds = new Set(pages.map((page) => page.id));
    const persisted = new Set(
      [...expandedIds].filter((pageId) => knownPageIds.has(pageId))
    );
    writePageListExpandedIdsToDocument(persisted);
  }, [expandedIds, pages]);

  const handleToggleExpand = useCallback((pageId: string) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  }, []);

  const ensurePageSeed = useCallback(
    async (pageId: string): Promise<PageMetadataSeed | undefined> => {
      if (hasLocalPageDocument(pageId)) {
        return;
      }

      const page = findPageById(pages, pageId);
      if (!page) {
        return;
      }

      const loaded = await loadPage({ data: { slug: page.slug } });
      return {
        blocks: loaded.blocks,
        serverBaselineHash: hashPageBlocks(loaded.blocks),
      };
    },
    [pages]
  );

  const repositionFromDropTarget = useCallback(
    (sourceId: string, target: PageListDropTarget) => {
      const command = dropTargetToRepositionCommand(target, sourceId, pages);

      let previewPlan: ReturnType<typeof planPageReposition>;
      try {
        previewPlan = planPageReposition({
          appendPageLinkOnParent: command.appendPageLinkOnParent,
          insertBeforePageId: command.insertBeforePageId,
          pageId: command.pageId,
          parentId: command.parentId,
          pages,
        });
      } catch {
        return;
      }

      const scopePageIdsToSeed = previewPlan.scopeSidebarOrderUpdates
        .map((update) => update.pageId)
        .filter((id) => !hasLocalPageDocument(id));

      Promise.all([
        ...scopePageIdsToSeed.map((id) => ensurePageSeed(id)),
        command.parentId && command.appendPageLinkOnParent
          ? ensurePageSeed(command.parentId)
          : Promise.resolve(undefined),
      ])
        .then((results) => {
          const scopeSeedResults = results.slice(0, scopePageIdsToSeed.length);
          const parentSeed = results.at(-1);
          const seedsByPageId: Record<string, PageMetadataSeed> = {};

          for (let index = 0; index < scopePageIdsToSeed.length; index += 1) {
            const scopePageId = scopePageIdsToSeed[index];
            const scopeSeed = scopeSeedResults[index];
            if (scopePageId && scopeSeed) {
              seedsByPageId[scopePageId] = scopeSeed;
            }
          }

          dispatch({
            type: "page.reposition",
            pageId: command.pageId,
            parentId: command.parentId,
            insertBeforePageId: command.insertBeforePageId,
            appendPageLinkOnParent: command.appendPageLinkOnParent,
            seed: seedsByPageId[command.pageId],
            seedsByPageId,
            parentSeed:
              parentSeed && command.parentId && command.appendPageLinkOnParent
                ? parentSeed
                : undefined,
          });
        })
        .catch(() => undefined);
    },
    [dispatch, ensurePageSeed, pages]
  );

  const dndConfig = useMemo<DndSurfaceConfig<PageListDropTarget>>(
    () => ({
      channel: pageDragChannel,
      dragImage: { kind: "overlay" },
      rowAttribute: PAGE_LIST_ROW_ATTRIBUTE,
      resolveDropTarget: ({ sourceId, pointer, rects }) =>
        resolvePageListDropTargetFromPointer({
          clientX: pointer.x,
          clientY: pointer.y,
          draggingPageId: sourceId,
          navRect: navRef.current?.getBoundingClientRect() ?? null,
          pages,
          rowRects: rects,
          visibleRows,
        }),
      onDrop: ({ sourceId, target }) =>
        repositionFromDropTarget(sourceId, target),
      onDragStart: ({ sourceId, pointer }) => {
        const page = findPageById(pages, sourceId);
        const rowEl = document.querySelector(
          `[${PAGE_LIST_ROW_ATTRIBUTE}="${sourceId}"]`
        );
        const rowRect =
          rowEl instanceof HTMLElement ? rowEl.getBoundingClientRect() : null;
        const depth =
          visibleRows.find((visibleRow) => visibleRow.pageId === sourceId)
            ?.depth ?? 0;

        setPreviewMeta({
          depth,
          icon: page?.icon,
          offsetX: rowRect ? pointer.x - rowRect.left : 0,
          offsetY: rowRect ? pointer.y - rowRect.top : 0,
          pageId: sourceId,
          title: page?.title ?? "Page",
          width: rowRect?.width ?? 200,
        });
      },
      onDragEnd: () => setPreviewMeta(null),
    }),
    [pages, repositionFromDropTarget, visibleRows]
  );

  if (tree.length === 0) {
    return (
      <nav aria-label="Pages" className="space-y-1">
        <SidebarMenu className="gap-y-px">
          <SidebarMenuItem>
            <div
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-md p-2 text-muted-foreground text-sm",
                pageListRowPaddingLeft(0)
              )}
            >
              <span aria-hidden className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">
                No pages yet.
              </span>
            </div>
          </SidebarMenuItem>
          <NewPageButton />
        </SidebarMenu>
      </nav>
    );
  }

  const listTree = (
    <PageListTree
      expandedIds={effectiveExpandedIds}
      navRef={navRef}
      onToggleExpand={handleToggleExpand}
      pages={pages}
      renderItem={({
        depth,
        expandedIds: ids,
        onToggleExpand,
        pages: p,
        row,
      }) => (
        <PageListItem
          depth={depth}
          expandedIds={ids}
          onToggleExpand={onToggleExpand}
          pages={p}
          row={row}
        />
      )}
      tree={tree}
    />
  );

  return (
    <DndSurface config={dndConfig}>
      <DragOverlay>
        {({ pointer }) =>
          previewMeta ? (
            <PageListDragPreview
              preview={{
                ...previewMeta,
                clientX: pointer.x,
                clientY: pointer.y,
              }}
            />
          ) : null
        }
      </DragOverlay>
      {listTree}
    </DndSurface>
  );
}

export function PageList() {
  const { sidebarPrefs } = useRouteContext({
    from: "__root__",
  });
  const { pages } = useMergedPageListItems();

  return (
    <PageListContent
      initialExpandedIds={sidebarPrefs.expandedPageIds}
      pages={pages}
    />
  );
}
