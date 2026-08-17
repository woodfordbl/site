import type { PageSummary } from "@/lib/content/list-pages.ts";
import { getPageDepth, pagesById } from "@/lib/pages/build-page-tree.ts";
import { MAX_PAGE_DEPTH } from "@/lib/pages/page-depth.ts";

/**
 * Minimal block-row shape the host scan reads — structurally satisfied by
 * `LocalBlock` rows (`localBlocksCollection.toArray`) and trivially fakeable
 * in tests.
 */
export interface HostScanBlock {
  pageId: string;
  props: unknown;
  type: string;
}

export interface ResolveDatabaseHostParentOptions {
  /** Block rows to scan — inject `localBlocksCollection.toArray`. */
  blocks: readonly HostScanBlock[];
  databaseId: string;
  /** Merged page catalog (shipped + local) the created page will join. */
  pages: readonly PageSummary[];
}

function blockDatabaseId(props: unknown): string | undefined {
  if (typeof props !== "object" || props === null) {
    return;
  }
  const { databaseId } = props as { databaseId?: unknown };
  return typeof databaseId === "string" ? databaseId : undefined;
}

/** Hub and materialized row pages are owned BY a database, never hosts of one. */
function isDatabaseOwnedPage(page: PageSummary): boolean {
  return (
    page.databaseSource !== undefined || page.databaseRowSource !== undefined
  );
}

/**
 * The database's **host page** id — the page whose blocks contain a
 * `database` block referencing this database.
 *
 * - Two sources, because a page's blocks live in one place or the other:
 *   locally-edited block rows, plus `PageSummary.databaseIds` for pages still
 *   pristine (their blocks are in shipped JSON, not the local shard). Local
 *   blocks win for any page that has them — `mergePageList` drops
 *   `databaseIds` from an overridden summary — so a database block the user
 *   deleted locally never comes back as a host.
 * - **Database-owned pages are skipped.** A hub page embeds a linked
 *   `database` block for its own database, so it would otherwise compete for
 *   host with the real page — and win, because hub ids are UUIDs that sort
 *   ahead of shipped ids like `home`. Seeding a hub mid-open would then
 *   invalidate the very row URL being opened.
 * - **Multiple hosts** (linked views render one database from several pages):
 *   the candidate with the lexicographically smallest `pageId` wins, so the
 *   choice is deterministic across renders and tabs.
 * - When only the hub is left (the host's `database` block was deleted but the
 *   database kept), the hub's parent takes over so hub/row URLs stay stable.
 * - Returns `null` when no host page exists in `pages`.
 */
export function findDatabaseHostPageId(
  options: ResolveDatabaseHostParentOptions
): string | null {
  const { blocks, databaseId, pages } = options;
  const pageMap = pagesById(pages as PageSummary[]);

  const candidateIds = new Set(
    blocks
      .filter(
        (block) =>
          block.type === "database" &&
          blockDatabaseId(block.props) === databaseId
      )
      .map((block) => block.pageId)
  );
  for (const page of pages) {
    if (page.databaseIds?.includes(databaseId)) {
      candidateIds.add(page.id);
    }
  }

  const hostPageIds = [...candidateIds]
    .filter((pageId) => {
      const page = pageMap.get(pageId);
      return page !== undefined && !isDatabaseOwnedPage(page);
    })
    .sort();

  if (hostPageIds[0]) {
    return hostPageIds[0];
  }

  const hub = pages.find(
    (page) => page.databaseSource?.databaseId === databaseId
  );
  const hubParentId = hub?.parentId;
  return hubParentId && pageMap.has(hubParentId) ? hubParentId : null;
}

/**
 * Resolves the `parentId` a materialized row page should be created under:
 * the database's {@link findDatabaseHostPageId host page}, with a depth clamp.
 *
 * - **Depth clamp**: if nesting under the host would exceed
 *   {@link MAX_PAGE_DEPTH}, walks up the host's ancestors to the deepest page
 *   that can still take a child.
 * - Returns `null` (create top-level) only when no host page exists in
 *   `pages` — unreachable through the UI, where a row page is always opened
 *   from a `database` block on some page.
 */
export function resolveDatabaseHostParentId(
  options: ResolveDatabaseHostParentOptions
): string | null {
  const pageMap = pagesById(options.pages as PageSummary[]);
  const hostPageId = findDatabaseHostPageId(options);

  let candidate = hostPageId ? pageMap.get(hostPageId) : undefined;

  // Walk up until the candidate is shallow enough to take a child page.
  while (candidate && getPageDepth(candidate, pageMap) >= MAX_PAGE_DEPTH) {
    candidate = candidate.parentId
      ? pageMap.get(candidate.parentId)
      : undefined;
  }

  return candidate?.id ?? null;
}
