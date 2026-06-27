import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readLocalStorageCollection } from "@/db/collections/read-local-storage-sync.ts";
import { seedPageBlocks } from "@/db/queries/block-collection-ops.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { hashPageMetadata } from "@/lib/content/page-metadata-hash.ts";
import { markPageDirty } from "@/lib/local-draft/dirty-pages-cookie.ts";
import { schedulePageSnapshotCapture } from "@/lib/pages/capture-page-snapshot.ts";
import { syncPageListLocalPreviewFromCollection } from "@/lib/pages/page-list-local-preview-cookie.ts";
import type { PageMetadataSeed } from "@/lib/pages/persist-page-metadata.ts";
import {
  recordFontSettingActivity,
  recordFullWidthSettingActivity,
  recordSmallTextSettingActivity,
} from "@/lib/pages/record-page-activity.ts";
import {
  isLocallyDeletedPage,
  localPageSchema,
} from "@/lib/schemas/local-page.ts";
import type { PageFont } from "@/lib/schemas/page-settings.ts";

const LOCAL_PAGES_STORAGE_KEY = "site-local-pages";
const seededPageIds = new Set<string>();

function hasLocalPageDocument(pageId: string): boolean {
  return (
    seededPageIds.has(pageId) ||
    readLocalStorageCollection(LOCAL_PAGES_STORAGE_KEY, localPageSchema).some(
      (page) => page.id === pageId && !isLocallyDeletedPage(page)
    )
  );
}

function applyPageSettingsDraft(
  draft: {
    font?: "default" | "serif" | "mono";
    fullWidth?: boolean;
    smallText?: boolean;
    updatedAt: string;
  },
  options: {
    font?: PageFont;
    fullWidth?: boolean;
    smallText?: boolean;
    updatedAt: string;
  }
): void {
  if (options.font !== undefined) {
    draft.font = options.font === "default" ? undefined : options.font;
  }
  if (options.smallText !== undefined) {
    draft.smallText = options.smallText ? true : undefined;
  }
  if (options.fullWidth !== undefined) {
    draft.fullWidth = options.fullWidth ? true : undefined;
  }
  draft.updatedAt = options.updatedAt;
}

/**
 * Persists display settings (`font`, `smallText`, `fullWidth`) to `localPagesCollection` (lazy-seeds when needed).
 * @see docs/architecture/pages.md#page-settings
 */
export function persistPageSettings(options: {
  pageId: string;
  font?: PageFont;
  fullWidth?: boolean;
  smallText?: boolean;
  seed?: PageMetadataSeed;
  pages?: PageSummary[];
}): void {
  const pages = options.pages ?? [];
  const existingPage = pages.find((page) => page.id === options.pageId);
  const now = new Date().toISOString();

  if (hasLocalPageDocument(options.pageId)) {
    localPagesCollection.update(options.pageId, (draft) => {
      applyPageSettingsDraft(draft, { ...options, updatedAt: now });
    });
    markPageDirty(options.pageId);
  } else if (options.seed && existingPage) {
    const serverMetadataBaseline = hashPageMetadata({
      icon: existingPage.icon,
      parentId: existingPage.parentId,
      sidebarOrder: existingPage.sidebarOrder,
      slug: existingPage.slug,
      title: existingPage.title,
      font: undefined,
      fullWidth: undefined,
      smallText: undefined,
    });

    localPagesCollection.insert({
      id: options.pageId,
      slug: existingPage.slug,
      title: existingPage.title,
      icon: existingPage.icon,
      parentId: existingPage.parentId,
      sidebarOrder: existingPage.sidebarOrder,
      font:
        options.font !== undefined && options.font !== "default"
          ? options.font
          : undefined,
      smallText: options.smallText ? true : undefined,
      fullWidth: options.fullWidth ? true : undefined,
      serverBaselineHash: options.seed.serverBaselineHash,
      serverMetadataBaseline,
      createdAt: now,
      updatedAt: now,
    });
    seedPageBlocks(options.pageId, options.seed.blocks);
    seededPageIds.add(options.pageId);
    markPageDirty(options.pageId);
  }

  if (hasLocalPageDocument(options.pageId) || options.seed) {
    syncPageListLocalPreviewFromCollection(localPagesCollection.toArray);
  }

  if (hasLocalPageDocument(options.pageId)) {
    schedulePageSnapshotCapture(options.pageId);
  }
  if (options.font !== undefined) {
    recordFontSettingActivity(options.pageId, options.font);
  }
  if (options.smallText !== undefined) {
    recordSmallTextSettingActivity(options.pageId, options.smallText);
  }
  if (options.fullWidth !== undefined) {
    recordFullWidthSettingActivity(options.pageId, options.fullWidth);
  }
}
