import { localDatabaseRowsCollection } from "@/db/collections/local-collections.ts";
import { clearDatabaseRowPageLinks } from "@/db/queries/database-collection-ops.ts";
import type { PageCommand } from "@/lib/canvas/commands.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";

/**
 * Materialized row-page ids for a database (`databaseRowSource`), plus any
 * `row.pageId` still linked even if the page summary is missing.
 */
export function listMaterializedDatabaseRowPageIds(
  databaseId: string,
  pages: readonly PageSummary[]
): string[] {
  const pageIds = new Set<string>();

  for (const page of pages) {
    if (page.databaseRowSource?.databaseId === databaseId) {
      pageIds.add(page.id);
    }
  }

  for (const row of localDatabaseRowsCollection.toArray) {
    if (row.databaseId === databaseId && row.pageId) {
      pageIds.add(row.pageId);
    }
  }

  return [...pageIds];
}

interface ClearDatabaseRowPagesOptions {
  databaseId: string;
  dispatchPage: (command: PageCommand) => void;
  pages: readonly PageSummary[];
}

/**
 * Wipe already-materialized row pages so the next open re-seeds from the
 * current row template via {@link ensureDatabaseRowPage}. Does not touch the
 * hub page, the template sentinel, or row property values. Not undoable.
 *
 * @returns How many page ids were deleted.
 * @see docs/architecture/databases.md#row-pages-slug-paths--seed-on-open
 */
export function clearDatabaseRowPages({
  databaseId,
  dispatchPage,
  pages,
}: ClearDatabaseRowPagesOptions): number {
  const pageIds = listMaterializedDatabaseRowPageIds(databaseId, pages);

  for (const pageId of pageIds) {
    dispatchPage({ type: "page.delete", pageId });
  }

  clearDatabaseRowPageLinks(databaseId);
  return pageIds.length;
}
