import type { PageSummary } from "@/lib/content/list-pages.ts";
import { isDatabaseTemplatePageId } from "@/lib/databases/database-template-page.ts";
import { isCanvasFixturePageId } from "@/lib/pages/canvas-fixture-page.ts";
import { isTemplatePageId } from "@/lib/pages/template-page.ts";
import {
  isLocallyDeletedPage,
  isUserCreatedPage,
  type LocalPage,
} from "@/lib/schemas/local-page.ts";

/**
 * Merges shipped summaries with local overrides; sets `routeBy` (`slug` vs `id` for user-only rows).
 * The template snapshot ({@link isTemplatePageId}) and the dev canvas fixture
 * ({@link isCanvasFixturePageId}) are dropped here so they never enter the
 * navigable list, the sidebar tree, or page dispatch.
 * @see docs/architecture/pages.md#navigation
 */
export function mergePageList(
  serverPages: PageSummary[],
  localPages: LocalPage[]
): PageSummary[] {
  const localById = new Map(localPages.map((page) => [page.id, page]));
  const serverIds = new Set(serverPages.map((page) => page.id));

  const merged: PageSummary[] = [];

  for (const serverPage of serverPages) {
    const local = localById.get(serverPage.id);
    if (local && isLocallyDeletedPage(local)) {
      continue;
    }

    if (local) {
      merged.push({
        id: local.id,
        slug: local.slug,
        title: local.title,
        parentId: local.parentId,
        sidebarOrder: local.sidebarOrder,
        icon: local.icon ?? serverPage.icon,
        databaseRowSource: local.databaseRowSource,
        routeBy: "slug",
      });
      continue;
    }

    merged.push({
      ...serverPage,
      sidebarOrder: serverPage.sidebarOrder,
      routeBy: "slug",
    });
  }

  for (const localPage of localPages) {
    if (
      isUserCreatedPage(localPage) &&
      !isTemplatePageId(localPage.id) &&
      !isDatabaseTemplatePageId(localPage.id) &&
      !isCanvasFixturePageId(localPage.id) &&
      !serverIds.has(localPage.id) &&
      !isLocallyDeletedPage(localPage)
    ) {
      merged.push({
        id: localPage.id,
        slug: localPage.slug,
        title: localPage.title,
        parentId: localPage.parentId,
        sidebarOrder: localPage.sidebarOrder,
        icon: localPage.icon,
        databaseRowSource: localPage.databaseRowSource,
        routeBy: "id",
      });
    }
  }

  return merged.sort((left, right) =>
    left.title.localeCompare(right.title, undefined, { sensitivity: "base" })
  );
}
