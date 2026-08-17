import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { capturePageBaseline } from "@/db/snapshots/page-baseline-store.ts";
import type { Block } from "@/lib/schemas/block.ts";

/**
 * Materialize a shipped page's local row the first time it is edited, so the
 * block shard has a page to hang off.
 *
 * Idempotent, and deliberately so: `hasLocalPage` comes from a live query that
 * cannot observe a write made earlier in the same tick, and StrictMode
 * double-mounts two effects that both capture `null`. Either way a second
 * insert of an id that already exists throws and takes the route down with it,
 * so the collection's own state is the deciding answer.
 *
 * Takes the page's fields rather than the whole source object so the calling
 * hook can keep memoizing on primitives.
 */
export function seedLocalPageMeta(options: {
  blockOrder?: string[];
  /** Pristine server content, for the conflict baseline. */
  blocks: Block[];
  hasLocalPage: boolean;
  icon?: string;
  pageId: string;
  parentId: string | null;
  serverBaselineHash: string;
  serverMetadataBaseline: string;
  sidebarOrder?: number;
  slug: string;
  title: string;
}): void {
  const { blocks, hasLocalPage, pageId, serverBaselineHash } = options;
  if (hasLocalPage || localPagesCollection.has(pageId)) {
    return;
  }

  const timestamp = new Date().toISOString();
  localPagesCollection.insert({
    id: pageId,
    slug: options.slug,
    title: options.title,
    icon: options.icon,
    parentId: options.parentId,
    sidebarOrder: options.sidebarOrder,
    blockOrder: options.blockOrder,
    serverBaselineHash,
    serverMetadataBaseline: options.serverMetadataBaseline,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  // The seeded shard holds post-edit blocks; the conflict baseline is the
  // pristine server content this overlay diverged from.
  capturePageBaseline(pageId, blocks, serverBaselineHash);
}
