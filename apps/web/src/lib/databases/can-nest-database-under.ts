import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  findDatabaseHostPageId,
  type HostScanBlock,
} from "@/lib/databases/resolve-database-host-page.ts";
import { getPageDepth, pagesById } from "@/lib/pages/build-page-tree.ts";
import { MAX_PAGE_DEPTH } from "@/lib/pages/page-depth.ts";

export interface CanNestDatabaseUnderOptions {
  /** Block rows to scan — inject `localBlocksCollection.toArray`. */
  blocks: readonly HostScanBlock[];
  databaseId: string;
  /** Merged page catalog (shipped + local). */
  pages: readonly PageSummary[];
  /** Candidate host page the database would move under. */
  parentPageId: string;
}

/**
 * Whether a database can take `parentPageId` as its new sidebar host.
 *
 * Rejects when the page is unknown, is already the database's
 * {@link findDatabaseHostPageId host}, is owned by a database (hub or
 * materialized row page), or is too deep to take the reparented hub as a
 * child.
 */
export function canNestDatabaseUnder(
  options: CanNestDatabaseUnderOptions
): boolean {
  const { blocks, databaseId, pages, parentPageId } = options;

  const pageMap = pagesById(pages as PageSummary[]);
  const parent = pageMap.get(parentPageId);
  if (!parent) {
    return false;
  }

  if (
    parent.databaseSource !== undefined ||
    parent.databaseRowSource !== undefined
  ) {
    return false;
  }

  if (findDatabaseHostPageId({ blocks, databaseId, pages }) === parentPageId) {
    return false;
  }

  return getPageDepth(parent, pageMap) < MAX_PAGE_DEPTH;
}
