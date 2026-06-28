import { getTemplatePageId } from "@/lib/pages/get-template-page.ts";
import { readTemplatePageId } from "@/lib/pages/template-page-cookie.ts";

/** Loads the template page id for SSR (request cookie) or client (`document.cookie`). */
export function loadTemplatePageId(): Promise<string | null> {
  if (typeof window === "undefined") {
    return getTemplatePageId();
  }

  return Promise.resolve(readTemplatePageId());
}
