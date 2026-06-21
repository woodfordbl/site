import type { PageRow } from "@/lib/pages/build-page-tree.ts";

export interface FlatVisiblePageRow {
  depth: number;
  pageId: string;
  parentId: string | null;
}

/** Pre-order flatten of sidebar rows respecting `expandedIds`. */
export function flattenVisiblePageRows(
  tree: PageRow[],
  expandedIds: Set<string>,
  depth = 0,
  parentId: string | null = null
): FlatVisiblePageRow[] {
  const rows: FlatVisiblePageRow[] = [];

  for (const row of tree) {
    rows.push({
      depth,
      pageId: row.page.id,
      parentId,
    });

    if (expandedIds.has(row.page.id) && row.children.length > 0) {
      rows.push(
        ...flattenVisiblePageRows(
          row.children,
          expandedIds,
          depth + 1,
          row.page.id
        )
      );
    }
  }

  return rows;
}
