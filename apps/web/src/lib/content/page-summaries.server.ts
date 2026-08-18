import { hashPageBlocks } from "@/lib/content/block-hash.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { getShippedPages } from "@/lib/content/page-store.server.ts";
import type { Page } from "@/lib/schemas/page.ts";

/**
 * @fileoverview Shipped pages as summaries.
 *
 * Its own `.server.ts` module rather than a plain export from
 * `list-pages.ts`: reading the bundled content glob is only allowed inside a
 * `createServerFn` handler (the bundler strips those) or behind a server-only
 * filename. Two callers need it outside a handler — the page-list server
 * function and the database-path check — so the filename is the honest way to
 * say where it can run.
 */

function shippedDatabaseIds(blocks: Page["blocks"]): string[] {
  const ids = new Set<string>();
  for (const block of blocks) {
    if (block.type === "database" && block.props.databaseId !== "") {
      ids.add(block.props.databaseId);
    }
  }
  return [...ids];
}

/** Every shipped page as a summary, title-sorted. */
export function shippedPageSummaries(): PageSummary[] {
  const pages = getShippedPages().map((page) => ({
    id: page.id,
    slug: page.slug,
    title: page.title,
    parentId: page.parentId,
    sidebarOrder: page.sidebarOrder,
    icon: page.icon,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
    contentHash: hashPageBlocks(page.blocks),
    databaseIds: shippedDatabaseIds(page.blocks),
  }));

  return pages.sort((left, right) =>
    left.title.localeCompare(right.title, undefined, {
      sensitivity: "base",
    })
  );
}
