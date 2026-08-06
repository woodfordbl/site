import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import { applyPageBlockDiff } from "@/db/queries/block-collection-ops.ts";
import { normalizeEditablePageBlocks } from "@/lib/blocks/ensure-minimum-blocks.ts";
import { orderBlocksByIds } from "@/lib/blocks/order-blocks.ts";
import { hashPageBlocks } from "@/lib/content/block-hash.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { loadPage } from "@/lib/content/load-page.ts";
import { persistPageMetadata } from "@/lib/pages/persist-page-metadata.ts";
import type { Block } from "@/lib/schemas/block.ts";
import { blocksFromLocalBlocks } from "@/lib/schemas/local-block.ts";

function referencesDatabase(block: Block, databaseId: string): boolean {
  return block.type === "database" && block.props.databaseId === databaseId;
}

function stripReferencingBlocks(blocks: Block[], databaseId: string): Block[] {
  return blocks.filter((block) => !referencesDatabase(block, databaseId));
}

function cleanedBlocks(blocks: Block[], databaseId: string): Block[] {
  const stripped = stripReferencingBlocks(blocks, databaseId);
  if (stripped.length === blocks.length) {
    return blocks;
  }
  return normalizeEditablePageBlocks(stripped).blocks;
}

function isDatabaseOwnedPage(page: PageSummary): boolean {
  return (
    page.databaseSource !== undefined || page.databaseRowSource !== undefined
  );
}

function cleanLocalHost(pageId: string, databaseId: string): void {
  const existing = readBlockShardForPage(pageId);
  if (existing.length === 0) {
    return;
  }

  const blockOrder = localPagesCollection.toArray.find(
    (page) => page.id === pageId
  )?.blockOrder;
  const previousBlocks = orderBlocksByIds(
    blocksFromLocalBlocks(existing),
    blockOrder
  );
  const nextBlocks = cleanedBlocks(previousBlocks, databaseId);

  if (nextBlocks === previousBlocks) {
    return;
  }

  applyPageBlockDiff(pageId, previousBlocks, nextBlocks, existing);
}

async function cleanShippedHost(
  page: PageSummary,
  databaseId: string,
  pages: PageSummary[]
): Promise<void> {
  let loaded: Awaited<ReturnType<typeof loadPage>>;
  try {
    loaded = await loadPage({ data: { slug: page.slug } });
  } catch {
    return;
  }

  const cleaned = cleanedBlocks(loaded.blocks, databaseId);
  if (cleaned === loaded.blocks) {
    return;
  }

  persistPageMetadata({
    pageId: page.id,
    title: page.title,
    slug: page.slug,
    pages,
    seed: {
      blocks: cleaned,
      serverBaselineHash: hashPageBlocks(loaded.blocks),
    },
  });
}

/**
 * Removes `database` blocks for `databaseId` from every **non-owned** host
 * page (skips hub / row pages so their linked blocks stay intact). Used by
 * {@link moveDatabaseHost} before appending on the new host.
 */
export async function stripDatabaseBlocksFromNonOwnedHosts(
  databaseId: string,
  pages: readonly PageSummary[]
): Promise<void> {
  if (typeof window === "undefined" || databaseId === "") {
    return;
  }

  for (const page of pages) {
    if (isDatabaseOwnedPage(page)) {
      continue;
    }

    const hasLocalBlocks = readBlockShardForPage(page.id).length > 0;
    if (hasLocalBlocks) {
      cleanLocalHost(page.id, databaseId);
      continue;
    }

    await cleanShippedHost(page, databaseId, [...pages]);
  }
}
