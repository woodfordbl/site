import { sweepOrphanAssets } from "@/db/assets/asset-gc.ts";
import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import { deleteAllBlocksForPage } from "@/db/queries/block-collection-ops.ts";
import { readBootstrapPageBlocks } from "@/db/queries/read-bootstrap-page-blocks.ts";
import { clearPageSnapshots } from "@/db/snapshots/page-snapshot-store.ts";
import { buildBlockTree } from "@/lib/blocks/block-tree.ts";
import { exportPageDocument } from "@/lib/content/page-export.ts";
import { preparePageDocumentForAuthorSave } from "@/lib/content/prepare-page-document-for-author-save.ts";
import { saveMediaAssets } from "@/lib/content/save-media-assets.ts";
import { savePage } from "@/lib/content/save-page.ts";
import { markPageClean } from "@/lib/local-draft/dirty-pages-cookie.ts";
import {
  isLocallyDeletedPage,
  type LocalPage,
} from "@/lib/schemas/local-page.ts";

export interface SaveAllPagesResult {
  failed: Array<{ pageId: string; title: string; error: string }>;
  saved: number;
}

async function saveLocalPageToSource(localPage: LocalPage): Promise<void> {
  const rows = buildBlockTree(readBootstrapPageBlocks(localPage.id).blocks);
  const exported = exportPageDocument(rows, {
    id: localPage.id,
    slug: localPage.slug,
    title: localPage.title,
    parentId: localPage.parentId ?? null,
    icon: localPage.icon,
    font: localPage.font,
    smallText: localPage.smallText,
  });

  const { doc, assets } = await preparePageDocumentForAuthorSave(exported);
  if (assets.length > 0) {
    await saveMediaAssets({ data: { assets } });
  }
  await savePage({ data: doc });

  localPagesCollection.delete(localPage.id);
  deleteAllBlocksForPage(readBlockShardForPage(localPage.id));
  clearPageSnapshots(localPage.id).catch(() => undefined);
  markPageClean(localPage.id);
}

/**
 * Dev author tool: writes every locally-edited page to `content/pages/**.json`
 * so the working copy becomes the shipped static content, then clears local
 * state. Tombstoned (locally-deleted) pages are skipped.
 * @see docs/architecture/author-dev-mode.md
 */
export async function saveAllLocalPages(): Promise<SaveAllPagesResult> {
  const pages = localPagesCollection.toArray.filter(
    (page) => !isLocallyDeletedPage(page)
  );

  const failed: SaveAllPagesResult["failed"] = [];
  let saved = 0;

  for (const page of pages) {
    try {
      await saveLocalPageToSource(page);
      saved += 1;
    } catch (error) {
      failed.push({
        pageId: page.id,
        title: page.title,
        error: error instanceof Error ? error.message : "Save failed",
      });
    }
  }

  await sweepOrphanAssets();
  return { failed, saved };
}
