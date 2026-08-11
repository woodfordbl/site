import {
  localBlocksCollection,
  localPagesCollection,
} from "@/db/collections/local-collections.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import { reparentDatabaseHub } from "@/db/queries/database-page-ops.ts";
import { hashPageBlocks } from "@/lib/content/block-hash.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { loadPage } from "@/lib/content/load-page.ts";
import { appendDatabaseBlockOnHostFromShard } from "@/lib/databases/append-database-block-on-host.ts";
import { canNestDatabaseUnder } from "@/lib/databases/can-nest-database-under.ts";
import { stripDatabaseBlocksFromNonOwnedHosts } from "@/lib/databases/strip-database-host-blocks.ts";
import { hasLocalPageDocument } from "@/lib/pages/local-page-document.ts";
import { persistPageMetadata } from "@/lib/pages/persist-page-metadata.ts";

async function ensureLocalHostSeed(
  pageId: string,
  pages: readonly PageSummary[]
): Promise<void> {
  if (
    hasLocalPageDocument(pageId) ||
    readBlockShardForPage(pageId).length > 0
  ) {
    return;
  }

  const page = pages.find((entry) => entry.id === pageId);
  if (!page) {
    return;
  }

  let loaded: Awaited<ReturnType<typeof loadPage>>;
  try {
    loaded = await loadPage({ data: { slug: page.slug } });
  } catch {
    return;
  }

  persistPageMetadata({
    pageId: page.id,
    title: page.title,
    slug: page.slug,
    pages: [...pages],
    seed: {
      blocks: loaded.blocks,
      serverBaselineHash: hashPageBlocks(loaded.blocks),
    },
  });
}

export interface MoveDatabaseHostResult {
  nextHubSlug: string;
  previousHubSlug: string;
}

/**
 * Moves a database's sidebar host: strips its `database` blocks from every
 * non-owned page, appends one on `newHostPageId`, and reparents the hub so
 * hub/row URLs stay under the new host.
 *
 * Returns the previous/next hub slug prefixes when the move applied so callers
 * can router-navigate if the active tab is on the hub or a row under it.
 *
 * @see docs/architecture/databases.md
 * @see docs/architecture/drag-and-drop.md
 */
export async function moveDatabaseHost(options: {
  databaseId: string;
  newHostPageId: string;
  pages: readonly PageSummary[];
}): Promise<MoveDatabaseHostResult | null> {
  const { databaseId, newHostPageId, pages } = options;
  if (typeof window === "undefined" || databaseId === "") {
    return null;
  }

  const blocks = localBlocksCollection.toArray;
  if (
    !canNestDatabaseUnder({
      blocks,
      databaseId,
      pages,
      parentPageId: newHostPageId,
    })
  ) {
    return null;
  }

  const hub = localPagesCollection.toArray.find(
    (page) => page.databaseSource?.databaseId === databaseId
  );
  if (!hub) {
    return null;
  }

  const previousHubSlug = hub.slug;

  await ensureLocalHostSeed(newHostPageId, pages);
  await stripDatabaseBlocksFromNonOwnedHosts(databaseId, pages);
  appendDatabaseBlockOnHostFromShard({
    databaseId,
    hostPageId: newHostPageId,
  });
  reparentDatabaseHub({ databaseId, newHostPageId });

  const nextHub =
    localPagesCollection.toArray.find(
      (page) => page.databaseSource?.databaseId === databaseId
    ) ?? localPagesCollection.get(hub.id);
  if (!nextHub) {
    return null;
  }

  return {
    nextHubSlug: nextHub.slug,
    previousHubSlug,
  };
}
