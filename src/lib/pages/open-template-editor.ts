import { TEMPLATE_PAGE_ID } from "@/lib/pages/template-page.ts";
import {
  createEmptyTemplate,
  templateExists,
} from "@/lib/pages/template-store.ts";

/**
 * Ensures a template snapshot exists, marks it active, and navigates to the
 * dedicated `/template` editor route.
 */
export function openTemplateEditor(
  navigate: (options: { to: "/template" }) => void,
  setTemplatePageId: (pageId: string) => void
): void {
  if (!templateExists()) {
    createEmptyTemplate();
  }
  setTemplatePageId(TEMPLATE_PAGE_ID);
  navigate({ to: "/template" });
}
