import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { isDatabaseTemplatePageId } from "@/lib/databases/database-template-page.ts";
import { normalizePageSlug } from "@/lib/pages/slugify.ts";
import { isTemplatePageId } from "@/lib/pages/template-page.ts";
import {
  isLocallyDeletedPage,
  isUserCreatedPage,
  type LocalPage,
} from "@/lib/schemas/local-page.ts";

/**
 * Resolves a live user page by metadata slug, ignoring delete tombstones and
 * duplicate slug rows (e.g. a soft-deleted shipped overlay left in storage).
 * @see docs/architecture/pages.md#navigation
 */
export function resolveActiveUserPageBySlug(
  pages: LocalPage[],
  slug: string
): LocalPage | null {
  const normalized = normalizePageSlug(slug);

  return (
    pages.find(
      (page) =>
        page.slug === normalized &&
        isUserCreatedPage(page) &&
        !isTemplatePageId(page.id) &&
        !isDatabaseTemplatePageId(page.id) &&
        !isLocallyDeletedPage(page)
    ) ?? null
  );
}

/**
 * Removes soft-deleted rows occupying a slug before `page.create` insert.
 * @see docs/reference/page-commands.md
 */
export function purgeSlugTombstonesForUserPageCreate(
  slug: string,
  parentId: string | null
): void {
  const normalized = normalizePageSlug(slug);
  const scopeParentId = parentId ?? null;

  for (const page of localPagesCollection.toArray) {
    if (
      page.slug === normalized &&
      (page.parentId ?? null) === scopeParentId &&
      isLocallyDeletedPage(page)
    ) {
      localPagesCollection.delete(page.id);
    }
  }
}
