import { getCookie } from "@tanstack/react-start/server";

import { TEMPLATE_PAGE_COOKIE_NAME } from "@/lib/pages/template-page-cookie.ts";

/** Reads the configured template page id from the request cookie (SSR). */
export function readTemplatePageIdFromRequest(): string | null {
  const value = getCookie(TEMPLATE_PAGE_COOKIE_NAME);
  return value && value.length > 0 ? value : null;
}
