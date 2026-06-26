import type { PageSummary } from "@/lib/content/list-pages.ts";
import { loadPage } from "@/lib/content/load-page.ts";
import type { Block } from "@/lib/schemas/block.ts";

/** Resolves blocks for duplicate: local shard first, else shipped JSON. */
export function resolveSourceBlocksForPage(
  page: PageSummary,
  localBlocks: Block[]
): Promise<Block[]> {
  if (localBlocks.length > 0) {
    return Promise.resolve(localBlocks);
  }

  return loadPage({ data: { slug: page.slug } }).then(
    (loaded) => loaded.blocks
  );
}
