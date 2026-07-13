import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readLocalStorageCollection } from "@/db/collections/read-local-storage-sync.ts";
import { seedPageBlocks } from "@/db/queries/block-collection-ops.ts";
import { capturePageBaseline } from "@/db/snapshots/page-baseline-store.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { hashPageMetadata } from "@/lib/content/page-metadata-hash.ts";
import { markPageDirty } from "@/lib/local-draft/dirty-pages-cookie.ts";
import {
  buildSlugFromTitle,
  collectDescendantPageIds,
  replacePageSlugPrefix,
} from "@/lib/pages/build-page-tree.ts";
import { schedulePageSnapshotCapture } from "@/lib/pages/capture-page-snapshot.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";
import { syncPageListLocalPreviewFromCollection } from "@/lib/pages/page-list-local-preview-cookie.ts";
import {
  normalizePageSlug,
  pageSlugsEqual,
  slugifyPageSegment,
} from "@/lib/pages/slugify.ts";
import { syncPageUrl } from "@/lib/pages/sync-url.ts";
import type { Block } from "@/lib/schemas/block.ts";
import {
  isLocallyDeletedPage,
  localPageSchema,
} from "@/lib/schemas/local-page.ts";

const LOCAL_PAGES_STORAGE_KEY = "site-local-pages";
const seededPageIds = new Set<string>();

/** Lazy-seed payload when the first local write targets a shipped page. */
/** Lazy-seed payload for first local write on a shipped page (blocks + baseline hash). */
export interface PageMetadataSeed {
  blocks: Block[];
  serverBaselineHash: string;
}

function hasLocalPageDocument(pageId: string): boolean {
  return (
    seededPageIds.has(pageId) ||
    readLocalStorageCollection(LOCAL_PAGES_STORAGE_KEY, localPageSchema).some(
      (page) => page.id === pageId && !isLocallyDeletedPage(page)
    )
  );
}

function cascadeDescendantSlugs(
  pageId: string,
  previousSlug: string,
  nextSlug: string,
  pages: PageSummary[]
): void {
  const descendantIds = collectDescendantPageIds(pageId, pages);

  for (const descendantId of descendantIds) {
    localPagesCollection.update(descendantId, (draft) => {
      draft.slug = replacePageSlugPrefix(previousSlug, nextSlug, draft.slug);
      draft.updatedAt = new Date().toISOString();
    });
  }
}

/**
 * Persists title, slug, and optional icon to `localPagesCollection` (lazy-seeds when needed).
 * Cascades descendant slug prefixes; `syncPageUrl` uses `{ userPage: true }` when `routeBy === "id"`.
 * @see docs/architecture/pages.md#title-editing
 */
export function persistPageMetadata(options: {
  pageId: string;
  icon?: string;
  previousSlug?: string;
  slug?: string;
  syncUrl?: boolean;
  title: string;
  seed?: PageMetadataSeed;
  pages?: PageSummary[];
}): { slug: string } {
  const title =
    options.title.trim() === "" ? DEFAULT_PAGE_TITLE : options.title;
  const pages = options.pages ?? [];
  const existingPage = pages.find((page) => page.id === options.pageId);
  let slug = normalizePageSlug(
    slugifyPageSegment(title.trim() || DEFAULT_PAGE_TITLE)
  );

  if (options.slug && options.slug.length > 0) {
    slug = normalizePageSlug(options.slug);
  } else if (existingPage) {
    slug = buildSlugFromTitle(existingPage, pages, title, slugifyPageSegment);
  }
  const now = new Date().toISOString();
  let didPersist = false;

  if (hasLocalPageDocument(options.pageId)) {
    localPagesCollection.update(options.pageId, (draft) => {
      draft.slug = slug;
      draft.title = title;
      if (options.icon !== undefined) {
        draft.icon = options.icon;
      }
      draft.updatedAt = now;
    });
    markPageDirty(options.pageId);
    didPersist = true;
  } else if (options.seed) {
    const serverMetadataBaseline = existingPage
      ? hashPageMetadata({
          icon: existingPage.icon,
          parentId: existingPage.parentId,
          sidebarOrder: existingPage.sidebarOrder,
          slug: existingPage.slug,
          title: existingPage.title,
        })
      : undefined;

    localPagesCollection.insert({
      id: options.pageId,
      slug,
      title,
      icon: options.icon ?? existingPage?.icon,
      parentId: existingPage?.parentId ?? null,
      serverBaselineHash: options.seed.serverBaselineHash,
      serverMetadataBaseline,
      createdAt: now,
      updatedAt: now,
    });
    seedPageBlocks(options.pageId, options.seed.blocks);
    capturePageBaseline(
      options.pageId,
      options.seed.blocks,
      options.seed.serverBaselineHash
    );
    seededPageIds.add(options.pageId);
    markPageDirty(options.pageId);
    didPersist = true;
  }

  if (
    options.previousSlug &&
    !pageSlugsEqual(options.previousSlug, slug) &&
    pages.length > 0
  ) {
    cascadeDescendantSlugs(
      options.pageId,
      normalizePageSlug(options.previousSlug),
      slug,
      pages
    );

    if (options.syncUrl && existingPage) {
      syncPageUrl(slug, { userPage: existingPage.routeBy === "id" });
    }
  }

  if (hasLocalPageDocument(options.pageId) || options.seed) {
    syncPageListLocalPreviewFromCollection(localPagesCollection.toArray);
  }

  if (didPersist) {
    schedulePageSnapshotCapture(options.pageId);
  }

  return { slug };
}
