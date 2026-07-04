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

/**
 * The database's **host page** id — the page whose blocks contain a
 * `database` block referencing this database.
 *
 * - Scans locally-edited block rows only. Pristine shipped pages keep their
 *   blocks in shipped JSON reachable through an async per-slug server fn, so
 *   they are deliberately out of scope here — every UI flow that reaches a
 *   row page has the host's blocks in the local shard.
 * - **Multiple hosts** (linked views render one database from several pages):
 *   the candidate with the lexicographically smallest `pageId` wins, so the
 *   choice is deterministic across renders and tabs.
 * - Returns `null` when no host page exists in `pages`.
 */
export function findDatabaseHostPageId(
  options: ResolveDatabaseHostParentOptions
): string | null {
  const { blocks, databaseId, pages } = options;
  const pageMap = pagesById(pages as PageSummary[]);

  const hostPageIds = [
    ...new Set(
      blocks
        .filter(
          (block) =>
            block.type === "database" &&
            blockDatabaseId(block.props) === databaseId
        )
        .map((block) => block.pageId)
    ),
  ]
    .filter((pageId) => pageMap.has(pageId))
    .sort();

  return hostPageIds[0] ?? null;
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
