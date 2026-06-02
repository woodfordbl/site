import type { PageSummary } from "@/lib/content/list-pages.ts";
import { dedupePageSegment } from "@/lib/pages/build-page-tree.ts";
import {
  buildChildSlug,
  normalizePageSlug,
  slugifyPageSegment,
} from "@/lib/pages/slugify.ts";

function userCreatedSiblingSummaries(
  parentId: string | null,
  pages: PageSummary[],
  excludePageId?: string
): PageSummary[] {
  return pages.filter(
    (page) =>
      page.routeBy === "id" &&
      page.id !== excludePageId &&
      (page.parentId ?? null) === parentId
  );
}

export function allocateUserPageSlug(options: {
  title: string;
  parentId: string | null;
  pageId: string;
  pages: PageSummary[];
  explicitSlug?: string;
}): string {
  if (options.explicitSlug) {
    return normalizePageSlug(options.explicitSlug);
  }

  const { title, parentId, pageId, pages } = options;
  const userSiblings = userCreatedSiblingSummaries(parentId, pages, pageId);
  const segment = dedupePageSegment(slugifyPageSegment(title), userSiblings);

  if (parentId) {
    const parent = pages.find((candidate) => candidate.id === parentId);
    if (!parent) {
      throw new Error("Parent page not found");
    }

    return buildChildSlug(parent.slug, segment);
  }

  return normalizePageSlug(segment);
}
