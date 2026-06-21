import type { PageSummary } from "@/lib/content/list-pages.ts";
import { decodePageIcon } from "@/lib/pages/page-icon.ts";

/** Collects unique Tabler icon names referenced by sidebar page summaries. */
export function tablerIconNamesFromPages(pages: PageSummary[]): string[] {
  const names = new Set<string>();

  for (const page of pages) {
    const decoded = decodePageIcon(page.icon);
    if (decoded.kind === "tabler") {
      names.add(decoded.name);
    }
  }

  return [...names];
}
