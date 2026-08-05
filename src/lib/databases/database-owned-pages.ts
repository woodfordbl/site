import type { PageSummary } from "@/lib/content/list-pages.ts";

function ownsDatabase(page: PageSummary, databaseId: string): boolean {
  return (
    page.databaseSource?.databaseId === databaseId ||
    page.databaseRowSource?.databaseId === databaseId
  );
}

function hasOwnedAncestor(
  pageId: string,
  owned: ReadonlySet<string>,
  parentById: ReadonlyMap<string, string | null>
): boolean {
  const visited = new Set<string>([pageId]);
  let parentId = parentById.get(pageId) ?? null;

  while (parentId !== null && !visited.has(parentId)) {
    if (owned.has(parentId)) {
      return true;
    }
    visited.add(parentId);
    parentId = parentById.get(parentId) ?? null;
  }

  return false;
}

/**
 * Pages that exist only to host a database — its hub page
 * (`databaseSource`) and every materialized row page (`databaseRowSource`) —
 * reduced to the roots of that set.
 *
 * Descendants are dropped because `page.delete` already cascades them, and
 * deleting an already hard-deleted page a second time re-inserts it as a
 * tombstone row.
 *
 * @see docs/architecture/databases.md
 */
export function resolveDatabaseOwnedPageDeleteRoots(
  databaseId: string,
  pages: readonly PageSummary[]
): string[] {
  const owned = new Set<string>();
  for (const page of pages) {
    if (ownsDatabase(page, databaseId)) {
      owned.add(page.id);
    }
  }

  if (owned.size === 0) {
    return [];
  }

  const parentById = new Map(pages.map((page) => [page.id, page.parentId]));
  return [...owned].filter(
    (pageId) => !hasOwnedAncestor(pageId, owned, parentById)
  );
}
