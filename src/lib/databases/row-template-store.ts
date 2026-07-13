import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import {
  deleteAllBlocksForPage,
  seedPageBlocks,
} from "@/db/queries/block-collection-ops.ts";
import { readBootstrapPageBlocks } from "@/db/queries/read-bootstrap-page-blocks.ts";
import { clearPageSnapshots } from "@/db/snapshots/page-snapshot-store.ts";
import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import {
  DATABASE_TEMPLATE_PAGE_TITLE,
  databaseTemplatePageId,
  databaseTemplatePageSlug,
} from "@/lib/databases/database-template-page.ts";
import { markPageClean } from "@/lib/local-draft/dirty-pages-cookie.ts";
import type { Block } from "@/lib/schemas/block.ts";
import {
  isLocallyDeletedPage,
  type LocalPage,
} from "@/lib/schemas/local-page.ts";
import type { PageFont } from "@/lib/schemas/page-settings.ts";

/**
 * Storage for database row-page templates, mirroring the site page template
 * (`template-store.ts`): the sentinel page record + its block shard ARE the
 * template — there is no copy on the database record. Rendering reads the
 * shard; the `/db/$databaseId/template` route edits it through the normal
 * page pipeline (undo history, snapshots, dirty tracking all apply).
 */

/** What row-page rendering inherits from the template. */
export interface RowTemplateSnapshot {
  blocks: Block[];
  /** Row pages inherit the template's body font only when explicitly set. */
  font?: PageFont;
  /** Row pages inherit the template's icon. */
  icon?: string;
}

/** The template's live page record, or null when absent/tombstoned. */
export function readRowTemplateRecord(databaseId: string): LocalPage | null {
  if (typeof window === "undefined") {
    return null;
  }
  const record = localPagesCollection.get(databaseTemplatePageId(databaseId));
  return record && !isLocallyDeletedPage(record) ? record : null;
}

/** True when `databaseId` has a custom row template. */
export function rowTemplateExists(databaseId: string): boolean {
  return readRowTemplateRecord(databaseId) != null;
}

/**
 * Synchronous read of the template snapshot for rendering/materialization.
 * Null when the database has no custom template (callers fall back to the
 * built-in blank default). Blocks come back in document order.
 */
export function readRowTemplateSnapshot(
  databaseId: string
): RowTemplateSnapshot | null {
  const record = readRowTemplateRecord(databaseId);
  if (!record) {
    return null;
  }
  return {
    blocks: readBootstrapPageBlocks(record.id).blocks,
    font: record.font,
    icon: record.icon,
  };
}

/** Creates an empty template (single text block) ready to be designed. */
export function createEmptyRowTemplate(databaseId: string): void {
  if (rowTemplateExists(databaseId)) {
    return;
  }
  const pageId = databaseTemplatePageId(databaseId);
  const now = new Date().toISOString();

  const tombstone = localPagesCollection.get(pageId);
  if (tombstone) {
    // A previous template was reset; revive the record instead of inserting.
    localPagesCollection.update(pageId, (draft) => {
      draft.deletedAt = undefined;
      draft.title = DATABASE_TEMPLATE_PAGE_TITLE;
      draft.parentId = null;
      draft.icon = undefined;
      draft.font = undefined;
      draft.blockOrder = undefined;
      draft.updatedAt = now;
    });
  } else {
    localPagesCollection.insert({
      id: pageId,
      slug: databaseTemplatePageSlug(databaseId),
      title: DATABASE_TEMPLATE_PAGE_TITLE,
      parentId: null,
      serverBaselineHash: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  seedPageBlocks(pageId, [createEmptyBlock("text")]);
}

/** Removes the template record, its blocks, and any captured snapshots. */
export function deleteRowTemplate(databaseId: string): void {
  const pageId = databaseTemplatePageId(databaseId);
  deleteAllBlocksForPage(readBlockShardForPage(pageId));
  clearPageSnapshots(pageId).catch(() => undefined);
  markPageClean(pageId);
  if (localPagesCollection.get(pageId)) {
    localPagesCollection.delete(pageId);
  }
}
