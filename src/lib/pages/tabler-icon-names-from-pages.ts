import type { PageSummary } from "@/lib/content/list-pages.ts";
import { decodePageIcon } from "@/lib/pages/page-icon.ts";

/** Tabler icons always included in SSR glyph preload (defaults + common block icons). */
export const SSR_TABLER_ICON_DEFAULTS = ["IconFile", "IconInfoCircle"] as const;

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

/** Page sidebar icons plus always-on defaults for passive display without the full catalog. */
export function tablerIconNamesForSSR(pages: PageSummary[]): string[] {
  const names = new Set<string>(SSR_TABLER_ICON_DEFAULTS);
  for (const name of tablerIconNamesFromPages(pages)) {
    names.add(name);
  }
  return [...names];
}
