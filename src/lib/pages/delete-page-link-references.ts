import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import { applyPageBlockDiff } from "@/db/queries/block-collection-ops.ts";
import { orderBlocksByIds } from "@/lib/blocks/order-blocks.ts";
import { hashPageBlocks } from "@/lib/content/block-hash.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { loadPage } from "@/lib/content/load-page.ts";
import { persistPageMetadata } from "@/lib/pages/persist-page-metadata.ts";
import type { Block } from "@/lib/schemas/block.ts";
import { blocksFromLocalBlocks } from "@/lib/schemas/local-block.ts";

function referencesDeletedPage(
  block: Block,
  deletedPageIds: Set<string>
): boolean {
  return block.type === "pageLink" && deletedPageIds.has(block.props.pageId);
}

function stripReferencingBlocks(
  blocks: Block[],
  deletedPageIds: Set<string>
): Block[] {
  return blocks.filter(
    (block) => !referencesDeletedPage(block, deletedPageIds)
  );
}

/** Removes referencing `pageLink` blocks from a host page already present in local storage. */
function cleanLocalHost(pageId: string, deletedPageIds: Set<string>): void {
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
  const nextBlocks = stripReferencingBlocks(previousBlocks, deletedPageIds);

  if (nextBlocks.length === previousBlocks.length) {
    return;
  }

  applyPageBlockDiff(pageId, previousBlocks, nextBlocks, existing);
}

/**
 * Seeds a shipped, never-edited host page locally with its referencing `pageLink`
 * blocks already removed. The seed's baseline is the hash of the *original* shipped
 * blocks so the page reads as a real local edit while "Reset to site version" still
 * restores the shipped content. Untouched shipped pages are never seeded.
 */
async function cleanShippedHost(
  page: PageSummary,
  deletedPageIds: Set<string>,
  pages: PageSummary[]
): Promise<void> {
  let loaded: Awaited<ReturnType<typeof loadPage>>;
  try {
    loaded = await loadPage({ data: { slug: page.slug } });
  } catch {
    return;
  }

  const cleaned = stripReferencingBlocks(loaded.blocks, deletedPageIds);
  if (cleaned.length === loaded.blocks.length) {
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
 * Removes every `pageLink` block that targets a deleted page (or descendant) from
 * every other page's content. Locally-seeded host pages are rewritten in place;
 * never-edited shipped host pages are seeded locally and cleaned (local-first).
 * Host pages that are themselves being deleted are skipped — their shards are
 * removed wholesale by the delete flow.
 * @see docs/architecture/pages.md#page-links
 */
export async function deletePageLinkReferences(
  deletedPageIds: Set<string>,
  pages: PageSummary[]
): Promise<void> {
  if (typeof window === "undefined" || deletedPageIds.size === 0) {
    return;
  }

  for (const page of pages) {
    if (deletedPageIds.has(page.id)) {
      continue;
    }

    const hasLocalBlocks = readBlockShardForPage(page.id).length > 0;
    if (hasLocalBlocks) {
      cleanLocalHost(page.id, deletedPageIds);
      continue;
    }

    await cleanShippedHost(page, deletedPageIds, pages);
  }
}
