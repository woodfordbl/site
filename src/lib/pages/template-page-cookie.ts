import {
  readDocumentCookie,
  writeDocumentCookie,
} from "@/lib/cookies/document-cookie.ts";

/** UI-hint cookie holding the page id used as the template for new pages. */
export const TEMPLATE_PAGE_COOKIE_NAME = "site-template-page";

/** Reads the configured template page id, or null when none is set. */
export function readTemplatePageId(): string | null {
  const value = readDocumentCookie(TEMPLATE_PAGE_COOKIE_NAME);
  return value && value.length > 0 ? value : null;
}

/** Persists (or clears with `null`) the template page id. */
export function writeTemplatePageId(id: string | null): boolean {
  return writeDocumentCookie(TEMPLATE_PAGE_COOKIE_NAME, id);
}
