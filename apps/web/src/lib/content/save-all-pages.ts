import { sweepOrphanAssets } from "@/db/assets/asset-gc.ts";
import {
  localDatabaseRowsCollection,
  localDatabasesCollection,
  localPagesCollection,
} from "@/db/collections/local-collections.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import { deleteAllBlocksForPage } from "@/db/queries/block-collection-ops.ts";
import { readBootstrapPageBlocks } from "@/db/queries/read-bootstrap-page-blocks.ts";
import { clearPageBaseline } from "@/db/snapshots/page-baseline-store.ts";
import { clearPageSnapshots } from "@/db/snapshots/page-snapshot-store.ts";
import { buildBlockTree } from "@/lib/blocks/block-tree.ts";
import {
  exportDatabaseDocument,
  hashDatabaseDocument,
} from "@/lib/content/database-export.ts";
import { exportPageDocument } from "@/lib/content/page-export.ts";
import { preparePageDocumentForAuthorSave } from "@/lib/content/prepare-page-document-for-author-save.ts";
import { saveDatabase } from "@/lib/content/save-database.ts";
import { saveMediaAssets } from "@/lib/content/save-media-assets.ts";
import { savePage } from "@/lib/content/save-page.ts";
import { isDatabaseTemplatePageId } from "@/lib/databases/database-template-page.ts";
import { markPageClean } from "@/lib/local-draft/dirty-pages-cookie.ts";
import { resolvePageLastEditedAt } from "@/lib/pages/page-activity-summary.ts";
import { isTemplatePageId } from "@/lib/pages/template-page.ts";
import type { LocalDatabase } from "@/lib/schemas/database.ts";
import {
  isLocallyDeletedPage,
  type LocalPage,
} from "@/lib/schemas/local-page.ts";
import type { Page } from "@/lib/schemas/page.ts";

export interface SaveAllPagesResult {
  failed: Array<{ pageId: string; title: string; error: string }>;
  failedDatabases: Array<{ databaseId: string; name: string; error: string }>;
  saved: number;
  savedDatabases: number;
  /** Persisted documents for pages that wrote successfully (before local clear). */
  savedPages: Page[];
}

export interface SaveAllLocalPagesOptions {
  /**
   * Called after every successful disk write and before local overlays are
   * cleared. Use this to seed client shipped-content React Query caches
   * (`publishSavedPageToClient`) so the canvas never falls back to pre-save
   * blocks. Do not await `router.invalidate()` here — open routes pick up
   * `setQueryData` via `useQuery` subscriptions.
   */
  beforeClearLocal?: (savedPages: Page[]) => void | Promise<void>;
}

function clearLocalPageAfterSave(pageId: string): void {
  const shard = readBlockShardForPage(pageId);
  localPagesCollection.delete(pageId);
  deleteAllBlocksForPage(shard);
  clearPageSnapshots(pageId).catch(() => undefined);
  clearPageBaseline(pageId).catch(() => undefined);
  markPageClean(pageId);
}

/**
 * Writes one local page to `content/pages/**.json` and returns the document as
 * persisted. Does not clear local state — the batch caller does that after
 * client caches are primed so the open canvas never paints stale shipped
 * blocks.
 */
async function writeLocalPageToSource(localPage: LocalPage): Promise<Page> {
  const shard = readBlockShardForPage(localPage.id);
  const rows = buildBlockTree(readBootstrapPageBlocks(localPage.id).blocks);
  const exported = exportPageDocument(rows, {
    id: localPage.id,
    slug: localPage.slug,
    title: localPage.title,
    parentId: localPage.parentId ?? null,
    icon: localPage.icon,
    font: localPage.font,
    fullWidth: localPage.fullWidth,
    textScale: localPage.textScale,
    createdAt: localPage.createdAt,
    updatedAt:
      resolvePageLastEditedAt({ localBlocks: shard, localPage }) ??
      localPage.updatedAt,
  });

  const { doc, assets } = await preparePageDocumentForAuthorSave(exported);
  if (assets.length > 0) {
    await saveMediaAssets({ data: { assets } });
  }
  const result = await savePage({ data: doc });
  return result.page;
}

/**
 * Writes one database to `content/databases/{id}.json` and stamps the local
 * copy's `serverBaselineHash`, so the seeder reads it as "unedited shipped
 * copy" from now on. Unlike pages, the local copy is kept — every database
 * surface reads the local collections, so clearing it would blank open views
 * until the next boot re-seed.
 */
async function saveLocalDatabaseToSource(database: LocalDatabase): Promise<{
  changed: boolean;
}> {
  const doc = exportDatabaseDocument(
    database,
    localDatabaseRowsCollection.toArray
  );
  const contentHash = hashDatabaseDocument(doc);
  if (contentHash === database.serverBaselineHash) {
    return { changed: false }; // already shipped byte-identical content
  }

  await saveDatabase({ data: doc });

  localDatabasesCollection.update(database.id, (draft) => {
    draft.serverBaselineHash = contentHash;
    draft.updatedAt = new Date().toISOString();
  });
  return { changed: true };
}

/**
 * Dev author tool: writes every locally-edited page to `content/pages/**.json`
 * (and every local database to `content/databases/*.json`) so the working
 * copy becomes the shipped static content, then clears local page state.
 * Tombstoned (locally-deleted) pages are skipped. Database exports skip
 * connector-synced rows — the shipped `source` config repopulates them
 * client-side — and databases whose content already matches their baseline.
 *
 * Local page overlays are cleared only after `beforeClearLocal` resolves, so
 * callers can publish the returned documents into React Query / router caches
 * first and avoid a flash of pre-save shipped blocks.
 */
export async function saveAllLocalPages(
  options: SaveAllLocalPagesOptions = {}
): Promise<SaveAllPagesResult> {
  const pages = localPagesCollection.toArray.filter(
    (page) =>
      !(
        isLocallyDeletedPage(page) ||
        isTemplatePageId(page.id) ||
        isDatabaseTemplatePageId(page.id)
      )
  );

  const failed: SaveAllPagesResult["failed"] = [];
  const savedPages: Page[] = [];

  for (const page of pages) {
    try {
      savedPages.push(await writeLocalPageToSource(page));
    } catch (error) {
      failed.push({
        pageId: page.id,
        title: page.title,
        error: error instanceof Error ? error.message : "Save failed",
      });
    }
  }

  await options.beforeClearLocal?.(savedPages);

  for (const page of savedPages) {
    clearLocalPageAfterSave(page.id);
  }

  const failedDatabases: SaveAllPagesResult["failedDatabases"] = [];
  let savedDatabases = 0;

  for (const database of localDatabasesCollection.toArray) {
    try {
      const { changed } = await saveLocalDatabaseToSource(database);
      if (changed) {
        savedDatabases += 1;
      }
    } catch (error) {
      failedDatabases.push({
        databaseId: database.id,
        name: database.name,
        error: error instanceof Error ? error.message : "Save failed",
      });
    }
  }

  await sweepOrphanAssets();
  return {
    failed,
    failedDatabases,
    saved: savedPages.length,
    savedDatabases,
    savedPages,
  };
}
