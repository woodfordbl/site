import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readLocalStorageCollection } from "@/db/collections/read-local-storage-sync.ts";
import { seedPageBlocks } from "@/db/queries/block-collection-ops.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { markPageDirty } from "@/lib/local-draft/dirty-pages-cookie.ts";
import {
  buildSlugFromTitle,
  collectDescendantPageIds,
  replacePageSlugPrefix,
} from "@/lib/pages/build-page-tree.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";
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

export function persistPageMetadata(options: {
  pageId: string;
  previousSlug?: string;
  slug?: string;
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

  if (hasLocalPageDocument(options.pageId)) {
    localPagesCollection.update(options.pageId, (draft) => {
      draft.slug = slug;
      draft.title = title;
      draft.updatedAt = now;
    });
    markPageDirty(options.pageId);
  } else if (options.seed) {
    localPagesCollection.insert({
      id: options.pageId,
      slug,
      title,
      parentId: existingPage?.parentId ?? null,
      serverBaselineHash: options.seed.serverBaselineHash,
      createdAt: now,
      updatedAt: now,
    });
    seedPageBlocks(options.pageId, options.seed.blocks);
    seededPageIds.add(options.pageId);
    markPageDirty(options.pageId);
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

    if (existingPage?.routeBy !== "id") {
      syncPageUrl(slug);
    }
  }

  return { slug };
}
