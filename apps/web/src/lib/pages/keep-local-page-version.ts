import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { capturePageBaseline } from "@/db/snapshots/page-baseline-store.ts";
import { hashPageBlocks } from "@/lib/content/block-hash.ts";
import { hashPageMetadata } from "@/lib/content/page-metadata-hash.ts";
import {
  isLocallyDeletedPage,
  isUserCreatedPage,
} from "@/lib/schemas/local-page.ts";
import type { Page } from "@/lib/schemas/page.ts";

/**
 * Resolves a stale overridden page by keeping the local edits: fast-forwards
 * the recorded server baseline (hashes + stored baseline blocks) to the current
 * shipped content so the page stops reporting a conflict. The shipped update is
 * acknowledged, not merged — the local overlay keeps rendering.
 *
 * The metadata hash must mirror `computePageStaleState`'s field subset exactly,
 * otherwise the fast-forward would not clear the stale flag.
 */
export function keepLocalPageVersion(serverPage: Page): boolean {
  const localPage =
    localPagesCollection.toArray.find((page) => page.id === serverPage.id) ??
    null;

  if (
    !localPage ||
    isLocallyDeletedPage(localPage) ||
    isUserCreatedPage(localPage)
  ) {
    return false;
  }

  const contentHash = hashPageBlocks(serverPage.blocks);
  const metadataHash = hashPageMetadata({
    icon: serverPage.icon,
    parentId: serverPage.parentId,
    sidebarOrder: serverPage.sidebarOrder,
    slug: serverPage.slug,
    title: serverPage.title,
  });

  localPagesCollection.update(serverPage.id, (draft) => {
    draft.serverBaselineHash = contentHash;
    draft.serverMetadataBaseline = metadataHash;
    draft.updatedAt = new Date().toISOString();
  });
  capturePageBaseline(serverPage.id, serverPage.blocks, contentHash);

  return true;
}
