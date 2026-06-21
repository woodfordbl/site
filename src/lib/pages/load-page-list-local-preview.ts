import { getPageListLocalPreview } from "@/lib/pages/get-page-list-local-preview.ts";
import {
  localPagesFromPreviewEntries,
  readPageListLocalPreviewFromDocument,
} from "@/lib/pages/page-list-local-preview-cookie.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";

export function loadPageListLocalPreview(): Promise<LocalPage[]> {
  if (typeof window === "undefined") {
    return getPageListLocalPreview();
  }

  return Promise.resolve(
    localPagesFromPreviewEntries(readPageListLocalPreviewFromDocument())
  );
}
