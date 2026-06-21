import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  type PageMetadataSeed,
  persistPageMetadata,
} from "@/lib/pages/persist-page-metadata.ts";

/**
 * Persists page `icon` metadata via `persistPageMetadata` (lazy-seeds shipped pages like title edits).
 * Called from `PageIconPicker` (canvas title or sidebar row overflow) — not dispatched as a `page.*` command.
 * @see docs/architecture/pages.md#page-icons
 */
export function persistPageIcon(options: {
  pageId: string;
  icon: string;
  title: string;
  previousSlug?: string;
  seed?: PageMetadataSeed;
  pages?: PageSummary[];
}): { slug: string } {
  return persistPageMetadata({
    pageId: options.pageId,
    icon: options.icon,
    title: options.title,
    previousSlug: options.previousSlug,
    seed: options.seed,
    pages: options.pages,
  });
}
