/**
 * A database's row-page template is a standalone snapshot — one reserved local
 * page per database holding the blocks (and icon/font settings) every row page
 * renders from. Like the site page template, it lives *outside* the navigable
 * pages system: excluded from the merged page list (sidebar, dispatch, slug
 * routing, publish) and edited only through `/db/$databaseId/template`.
 * Deleting real pages can never touch it; deleting the database removes it.
 */

/** Id prefix reserving a database's row-template page record and block shard. */
export const DATABASE_TEMPLATE_PAGE_ID_PREFIX = "db-template:";

/** Reserved page id for `databaseId`'s row template. */
export function databaseTemplatePageId(databaseId: string): string {
  return `${DATABASE_TEMPLATE_PAGE_ID_PREFIX}${databaseId}`;
}

/** True when `id` is any database's reserved row-template page id. */
export function isDatabaseTemplatePageId(
  id: string | null | undefined
): boolean {
  return (
    typeof id === "string" && id.startsWith(DATABASE_TEMPLATE_PAGE_ID_PREFIX)
  );
}

/** Internal slug for a template record; never resolved as a navigable route. */
export function databaseTemplatePageSlug(databaseId: string): string {
  return `/__db-template__/${databaseId}`;
}

/** Title shown while editing a row template. */
export const DATABASE_TEMPLATE_PAGE_TITLE = "Row template";
