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
  recordHeaderImageSettingActivity,
  recordTextScaleSettingActivity,
} from "@/lib/pages/record-page-activity.ts";
import {
  isLocallyDeletedPage,
  localPageSchema,
} from "@/lib/schemas/local-page.ts";
import type {
  PageFont,
  PageHeaderImage,
  PageTextScale,
} from "@/lib/schemas/page-settings.ts";

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
    headerImage?: PageHeaderImage;
    textScale?: PageTextScale;
    updatedAt: string;
  },
  options: {
    font?: PageFont;
    fullWidth?: boolean;
    headerImage?: PageHeaderImage | null;
    textScale?: PageTextScale | null;
    updatedAt: string;
  }
): void {
  if (options.font !== undefined) {
    draft.font = options.font === "default" ? undefined : options.font;
  }
  if (options.textScale !== undefined) {
    // `null` clears the per-page override so the page inherits the site default.
    draft.textScale = options.textScale ?? undefined;
  }
  if (options.fullWidth !== undefined) {
    draft.fullWidth = options.fullWidth ? true : undefined;
  }
  if (options.headerImage !== undefined) {
    draft.headerImage = options.headerImage ?? undefined;
  }
  draft.updatedAt = options.updatedAt;
}

/**
 * Persists display settings (`font`, `textScale`, `fullWidth`) to `localPagesCollection` (lazy-seeds when needed).
 * @see docs/architecture/pages.md#page-settings
 */
export function persistPageSettings(options: {
  pageId: string;
  font?: PageFont;
  fullWidth?: boolean;
  /** `PageHeaderImage` sets a cover; `null` removes it; omit to leave unchanged. */
  headerImage?: PageHeaderImage | null;
  /** A scale sets the override; `null` clears it; `undefined` leaves it as-is. */
  textScale?: PageTextScale | null;
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
      textScale: undefined,
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
      textScale: options.textScale ?? undefined,
      fullWidth: options.fullWidth ? true : undefined,
      headerImage: options.headerImage ?? undefined,
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
  if (options.textScale !== undefined) {
    recordTextScaleSettingActivity(options.pageId, options.textScale);
  }
  if (options.fullWidth !== undefined) {
    recordFullWidthSettingActivity(options.pageId, options.fullWidth);
  }
  if (options.headerImage !== undefined) {
    recordHeaderImageSettingActivity(
      options.pageId,
      options.headerImage !== null
    );
  }
}
