import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  isLocallyDeletedPage,
  isUserCreatedPage,
  type LocalPage,
} from "@/lib/schemas/local-page.ts";

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
        routeBy: "slug",
      });
      continue;
    }

    merged.push({ ...serverPage, routeBy: "slug" });
  }

  for (const localPage of localPages) {
    if (
      isUserCreatedPage(localPage) &&
      !serverIds.has(localPage.id) &&
      !isLocallyDeletedPage(localPage)
    ) {
      merged.push({
        id: localPage.id,
        slug: localPage.slug,
        title: localPage.title,
        parentId: localPage.parentId,
        routeBy: "id",
      });
    }
  }

  return merged.sort((left, right) =>
    left.title.localeCompare(right.title, undefined, { sensitivity: "base" })
  );
}
