import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { seedPageBlocks } from "@/db/queries/block-collection-ops.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { hashPageMetadata } from "@/lib/content/page-metadata-hash.ts";
import { markPageDirty } from "@/lib/local-draft/dirty-pages-cookie.ts";
import type { PageMetadataSeed } from "@/lib/pages/persist-page-metadata.ts";
import type { PageRepositionPlan } from "@/lib/pages/reposition-page.ts";
import { normalizePageSlug, pageSlugsEqual } from "@/lib/pages/slugify.ts";
import { syncPageUrl } from "@/lib/pages/sync-url.ts";

interface RepositionWriteContext {
  now: string;
  pages: PageSummary[];
  plan: PageRepositionPlan;
  seed?: PageMetadataSeed;
  seedsByPageId?: Record<string, PageMetadataSeed>;
  slug: string;
}

function applyScopeOrderUpdate(
  update: PageRepositionPlan["scopeSidebarOrderUpdates"][number],
  ctx: RepositionWriteContext
): void {
  const { now, pages, plan, seed, seedsByPageId, slug } = ctx;
  const isMovedPage = update.pageId === plan.pageId;
  const localPage = localPagesCollection.toArray.find(
    (page) => page.id === update.pageId
  );

  if (localPage) {
    localPagesCollection.update(update.pageId, (draft) => {
      draft.sidebarOrder = update.sidebarOrder;
      if (isMovedPage) {
        draft.slug = slug;
        draft.title = plan.title;
        draft.parentId = plan.parentId;
      }
      draft.updatedAt = now;
    });
    markPageDirty(update.pageId);
    return;
  }

  const pageSeed = isMovedPage ? seed : seedsByPageId?.[update.pageId];
  if (!pageSeed) {
    return;
  }

  const summary = pages.find((page) => page.id === update.pageId);
  localPagesCollection.insert({
    id: update.pageId,
    slug: isMovedPage ? slug : normalizePageSlug(summary?.slug ?? "/"),
    title: isMovedPage ? plan.title : (summary?.title ?? ""),
    parentId: isMovedPage ? plan.parentId : (summary?.parentId ?? null),
    sidebarOrder: update.sidebarOrder,
    icon: summary?.icon,
    serverBaselineHash: pageSeed.serverBaselineHash,
    serverMetadataBaseline: summary
      ? hashPageMetadata({
          icon: summary.icon,
          parentId: summary.parentId,
          sidebarOrder: summary.sidebarOrder,
          slug: summary.slug,
          title: summary.title,
        })
      : undefined,
    createdAt: now,
    updatedAt: now,
  });
  seedPageBlocks(update.pageId, pageSeed.blocks);
  markPageDirty(update.pageId);
}

function applyDescendantSlugUpdate(
  update: PageRepositionPlan["descendantSlugUpdates"][number],
  now: string
): void {
  const descendantLocal = localPagesCollection.toArray.find(
    (page) => page.id === update.pageId
  );
  if (!descendantLocal) {
    return;
  }

  localPagesCollection.update(update.pageId, (draft) => {
    draft.slug = normalizePageSlug(update.slug);
    draft.updatedAt = now;
  });
  markPageDirty(update.pageId);
}

/**
 * Writes `page.reposition` metadata (`parentId`, `sidebarOrder`, slug) to `localPagesCollection`.
 * @see docs/reference/page-commands.md#page-reposition
 */
export function persistPageReposition(options: {
  plan: PageRepositionPlan;
  pages: PageSummary[];
  seed?: PageMetadataSeed;
  seedsByPageId?: Record<string, PageMetadataSeed>;
}): void {
  const { plan, pages, seed, seedsByPageId } = options;
  const now = new Date().toISOString();
  const existingPage = pages.find((page) => page.id === plan.pageId);
  const slug = normalizePageSlug(plan.slug);
  const ctx: RepositionWriteContext = {
    now,
    pages,
    plan,
    seed,
    seedsByPageId,
    slug,
  };

  for (const update of plan.scopeSidebarOrderUpdates) {
    applyScopeOrderUpdate(update, ctx);
  }

  for (const update of plan.descendantSlugUpdates) {
    applyDescendantSlugUpdate(update, now);
  }

  if (existingPage && !pageSlugsEqual(plan.previousSlug, slug)) {
    syncPageUrl(slug, { userPage: existingPage.routeBy === "id" });
  }
}
