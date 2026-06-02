import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useActivePageRef } from "@/hooks/use-active-page-ref.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";
import {
  useMergedPageListItems,
  usePageListItems,
} from "@/hooks/use-page-list.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  buildPageTree,
  getAncestorPageIds,
  type PageRow,
} from "@/lib/pages/build-page-tree.ts";

import { PageListItem, PageListItemStatic } from "./page-list-item.tsx";

function findPageById(
  pages: PageSummary[],
  pageId: string
): PageSummary | undefined {
  return pages.find((page) => page.id === pageId);
}

function PageListTree({
  tree,
  pages,
  expandedIds,
  onToggleExpand,
  renderItem,
}: {
  tree: PageRow[];
  pages: PageSummary[];
  expandedIds: Set<string>;
  onToggleExpand: (pageId: string) => void;
  renderItem: (props: {
    depth: number;
    expandedIds: Set<string>;
    onToggleExpand: (pageId: string) => void;
    pages: PageSummary[];
    row: PageRow;
  }) => ReactNode;
}) {
  return (
    <nav aria-label="Pages" className="space-y-1">
      <ul className="space-y-1">
        {tree.map((row) => (
          <li key={row.page.id}>
            {renderItem({
              depth: 0,
              expandedIds,
              onToggleExpand,
              pages,
              row,
            })}
          </li>
        ))}
      </ul>
    </nav>
  );
}

function PageListLive() {
  const { pages } = useMergedPageListItems();
  const activePage = useActivePageRef();
  const tree = useMemo(() => buildPageTree(pages), [pages]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const currentPage = activePage.pageId
      ? findPageById(pages, activePage.pageId)
      : undefined;

    if (!currentPage) {
      return;
    }

    const ancestors = getAncestorPageIds(currentPage.id, pages);
    if (ancestors.length === 0) {
      return;
    }

    setExpandedIds((previous) => {
      const next = new Set(previous);
      for (const pageId of ancestors) {
        next.add(pageId);
      }
      return next;
    });
  }, [activePage.pageId, pages]);

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

  if (tree.length === 0) {
    return <p className="text-muted-foreground text-sm">No pages yet.</p>;
  }

  return (
    <PageListTree
      expandedIds={expandedIds}
      onToggleExpand={handleToggleExpand}
      pages={pages}
      renderItem={({ depth, expandedIds, onToggleExpand, pages, row }) => (
        <PageListItem
          depth={depth}
          expandedIds={expandedIds}
          onToggleExpand={onToggleExpand}
          pages={pages}
          row={row}
        />
      )}
      tree={tree}
    />
  );
}

function PageListView({
  pages,
}: {
  pages: ReturnType<typeof usePageListItems>["pages"];
}) {
  const tree = useMemo(() => buildPageTree(pages), [pages]);

  if (tree.length === 0) {
    return <p className="text-muted-foreground text-sm">No pages yet.</p>;
  }

  return (
    <PageListTree
      expandedIds={new Set()}
      onToggleExpand={() => undefined}
      pages={pages}
      renderItem={({ depth, row }) => (
        <PageListItemStatic depth={depth} row={row} />
      )}
      tree={tree}
    />
  );
}

export function PageList({
  hasAnyLocalDrafts = false,
}: {
  hasAnyLocalDrafts?: boolean;
}) {
  const isClient = useIsClient();
  const { pages } = usePageListItems();

  if (!isClient) {
    if (hasAnyLocalDrafts) {
      return null;
    }

    return <PageListView pages={pages} />;
  }

  return <PageListLive />;
}
