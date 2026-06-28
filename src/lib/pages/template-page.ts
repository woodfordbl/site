/**
 * The page template is a standalone snapshot — a reserved local page that holds
 * the blocks and settings new pages start from. It deliberately lives *outside*
 * the navigable pages system: it is excluded from the merged page list (so it
 * never appears in the sidebar, dispatch, delete, reposition, or slug routing)
 * and is edited only through the dedicated `/template` route. New pages clone a
 * deep copy of its content; deleting any real page can never touch it.
 */

/** Reserved id for the template snapshot's local page record and block shard. */
export const TEMPLATE_PAGE_ID = "site-template";

/** Internal slug for the template record; never resolved as a navigable route. */
export const TEMPLATE_PAGE_SLUG = "/__template__";

/** Title shown while editing the template. */
export const TEMPLATE_PAGE_TITLE = "Page template";

/** True when `id` is the reserved template snapshot id. */
export function isTemplatePageId(id: string | null | undefined): boolean {
  return id === TEMPLATE_PAGE_ID;
}
