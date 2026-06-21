import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  dedupePageSegment,
  siblingPages,
} from "@/lib/pages/build-page-tree.ts";
import {
  buildChildSlug,
  normalizePageSlug,
  slugifyPageSegment,
} from "@/lib/pages/slugify.ts";

/**
 * Allocates a metadata slug for a user-created page (parent path + deduped segment).
 * @see docs/architecture/pages.md#slug-rules
 */
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
  const siblings = siblingPages(
    { id: pageId, slug: "", title, parentId },
    pages
  );
  const segment = dedupePageSegment(slugifyPageSegment(title), siblings);

  if (parentId) {
    const parent = pages.find((candidate) => candidate.id === parentId);
    if (!parent) {
      throw new Error("Parent page not found");
    }

    return buildChildSlug(parent.slug, segment);
  }

  return normalizePageSlug(segment);
}
