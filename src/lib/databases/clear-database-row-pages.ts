import { localDatabaseRowsCollection } from "@/db/collections/local-collections.ts";
import {
  clearDatabaseRowPageLink,
  clearDatabaseRowPageLinks,
} from "@/db/queries/database-collection-ops.ts";
import type { PageCommand } from "@/lib/canvas/commands.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import type { LocalDatabaseRow } from "@/lib/schemas/database.ts";

/** Whether a row owns separate page content rather than the shared template. */
export function isDatabaseRowPageMaterialized(
  row: Pick<LocalDatabaseRow, "id" | "pageId">,
  pages: readonly PageSummary[]
): boolean {
  if (row.pageId) {
    return true;
  }
  return pages.some((page) => page.databaseRowSource?.rowId === row.id);
}

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

interface ClearDatabaseRowPageOptions {
  dispatchPage: (command: PageCommand) => void;
  pages: readonly PageSummary[];
  row: Pick<LocalDatabaseRow, "databaseId" | "id" | "pageId">;
}

/**
 * Wipe one row's materialized content, preserving its icon and property values.
 * The next row-page open seeds a fresh body from the current template.
 *
 * @returns Whether a materialized page/link was found and cleared.
 */
export function clearDatabaseRowPage({
  dispatchPage,
  pages,
  row,
}: ClearDatabaseRowPageOptions): boolean {
  const pageIds = new Set<string>();
  if (row.pageId) {
    pageIds.add(row.pageId);
  }
  for (const page of pages) {
    if (
      page.databaseRowSource?.databaseId === row.databaseId &&
      page.databaseRowSource.rowId === row.id
    ) {
      pageIds.add(page.id);
    }
  }
  if (pageIds.size === 0) {
    return false;
  }

  for (const pageId of pageIds) {
    dispatchPage({ type: "page.delete", pageId });
  }
  clearDatabaseRowPageLink(row.id);
  return true;
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
