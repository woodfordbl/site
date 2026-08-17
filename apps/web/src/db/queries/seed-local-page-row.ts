/**
 * @fileoverview Idempotent first-edit seed of a page's local overlay row.
 *
 * A shipped page has no row in `localPagesCollection` until something edits it;
 * the first block transaction inserts one and captures the conflict baseline.
 * That insert must tolerate losing a race: two dispatches in a single React
 * flush (a StrictMode double-invoked effect, or two blocks reacting to the same
 * state) both observe "no local row" and both insert. Seeding twice is
 * harmless, but an uncaught duplicate-id throw escapes the canvas reducer and
 * unmounts the whole page behind an error boundary.
 */
import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { capturePageBaseline } from "@/db/snapshots/page-baseline-store.ts";
import type { Block } from "@/lib/schemas/block.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";

export interface SeedLocalPageRowInput {
  /** Flat block order at seed time, when the caller already computed it. */
  blockOrder?: string[];
  metadata: Pick<
    LocalPage,
    "icon" | "parentId" | "sidebarOrder" | "slug" | "title"
  >;
  pageId: string;
  serverBaselineHash: string;
  /** Pristine server content this overlay diverges from. */
  serverBlocks: Block[];
  serverMetadataBaseline: string;
}

/**
 * Insert the page's local row and capture its conflict baseline, unless a row
 * already exists. Returns whether this call did the seeding. Rethrows any
 * insert failure that did not resolve itself into an existing row.
 */
export function seedLocalPageRow(input: SeedLocalPageRowInput): boolean {
  if (localPagesCollection.has(input.pageId)) {
    return false;
  }

  const timestamp = new Date().toISOString();
  try {
    localPagesCollection.insert({
      ...input.metadata,
      blockOrder: input.blockOrder,
      createdAt: timestamp,
      id: input.pageId,
      serverBaselineHash: input.serverBaselineHash,
      serverMetadataBaseline: input.serverMetadataBaseline,
      updatedAt: timestamp,
    });
  } catch (error) {
    if (!localPagesCollection.has(input.pageId)) {
      throw error;
    }
    return false;
  }

  // The seeded shard holds post-edit blocks; the baseline is what it diverged
  // from, so it is captured only by the call that actually seeded.
  capturePageBaseline(
    input.pageId,
    input.serverBlocks,
    input.serverBaselineHash
  );
  return true;
}
