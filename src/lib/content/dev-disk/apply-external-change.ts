import type { QueryClient } from "@tanstack/react-query";

import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import { applyPageBlockDiff } from "@/db/queries/block-collection-ops.ts";
import { orderBlocksByIds } from "@/lib/blocks/order-blocks.ts";
import { isOwnWrite } from "@/lib/content/dev-disk/own-writes.ts";
import { markdownPathToSlug } from "@/lib/content/page-path.ts";
import { pageBySlugQueryOptions } from "@/lib/content/page-query.ts";
import { blocksFromLocalBlocks } from "@/lib/schemas/local-block.ts";
import type { Page } from "@/lib/schemas/page.ts";

/**
 * Inbound direction of dev disk mode: a `site:content-changed` event arrived
 * from the content watcher. Echoes of our own flushes are dropped by hash;
 * everything else invalidates the content queries so open canvases re-render
 * from disk, and a page with a live working copy gets its blocks replaced in
 * place — unless a flush for it is pending, in which case the editor's state
 * is newer and wins (last writer converges on the next flush).
 */

export interface ContentChangedEvent {
  contentHash?: string;
  event: "add" | "bulk" | "change" | "unlink";
  kind: "database" | "page";
  /** Path relative to `content/` (e.g. `pages/previous-work/altitude.md`). */
  path?: string;
}

const PAGES_PREFIX = "pages/";

async function reconcileWorkingCopy(
  queryClient: QueryClient,
  slug: string,
  hasPendingFlush: (pageId: string) => boolean
): Promise<void> {
  let page: Page;
  try {
    page = await queryClient.fetchQuery(pageBySlugQueryOptions(slug));
  } catch {
    return; // deleted or unreadable — the catalog invalidation handles it
  }
  const localPage = localPagesCollection.get(page.id);
  if (!localPage || hasPendingFlush(page.id)) {
    return;
  }
  const existing = readBlockShardForPage(page.id);
  const localBlocks = orderBlocksByIds(
    blocksFromLocalBlocks(existing),
    localPage.blockOrder
  );
  applyPageBlockDiff(page.id, localBlocks, page.blocks, existing);
  localPagesCollection.update(page.id, (draft) => {
    draft.title = page.title;
    draft.icon = page.icon;
    draft.updatedAt = new Date().toISOString();
  });
}

export async function applyExternalContentChange(
  event: ContentChangedEvent,
  queryClient: QueryClient,
  options: { hasPendingFlush: (pageId: string) => boolean }
): Promise<void> {
  if (event.contentHash && isOwnWrite(event.contentHash)) {
    return;
  }

  if (event.event === "bulk" || event.kind === "database") {
    await queryClient.invalidateQueries();
    return;
  }

  await queryClient.invalidateQueries({ queryKey: ["pages"] });
  await queryClient.invalidateQueries({ queryKey: ["site-pages"] });

  if (
    event.event !== "unlink" &&
    event.path?.startsWith(PAGES_PREFIX) &&
    event.path.endsWith(".md")
  ) {
    const slug = markdownPathToSlug(event.path.slice(PAGES_PREFIX.length));
    await reconcileWorkingCopy(queryClient, slug, options.hasPendingFlush);
  }
}
