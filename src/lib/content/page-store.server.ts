import {
  assembleMarkdownPages,
  type RawPageFile,
} from "@/lib/content/assemble-markdown-pages.ts";
import { computePagesCatalogRevision } from "@/lib/content/pages-catalog-revision.ts";
import type { Page } from "@/lib/schemas/page.ts";

/**
 * Shipped pages, bundled at build time as raw markdown. Runtime
 * `readFile(process.cwd(), …)` is not portable to deployed server functions
 * (the content directory is not traced into the bundle); the glob guarantees
 * inclusion and stays HMR-aware for author dev mode saves. Parsing happens
 * once per module instance and is memoized.
 */
const pageModules = import.meta.glob("../../../content/pages/**/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

const CONTENT_PREFIX = "content/pages/";

let cachedPagesBySlug: Map<string, Page> | null = null;

function getPagesBySlug(): Map<string, Page> {
  if (cachedPagesBySlug) {
    return cachedPagesBySlug;
  }

  const files: RawPageFile[] = Object.entries(pageModules).map(
    ([modulePath, raw]) => ({
      relativePath: modulePath.slice(
        modulePath.indexOf(CONTENT_PREFIX) + CONTENT_PREFIX.length
      ),
      raw: raw as string,
    })
  );

  cachedPagesBySlug = new Map(
    assembleMarkdownPages(files).map((page) => [page.slug, page])
  );
  return cachedPagesBySlug;
}

export function getShippedPages(): Page[] {
  return [...getPagesBySlug().values()];
}

/** Lookup by normalized metadata slug (e.g. `/`, `/previous-work/altitude`). */
export function getShippedPageBySlug(slug: string): Page | undefined {
  return getPagesBySlug().get(slug);
}

/** Revision token for the shipped catalog; exposed to the client for deploy freshness. */
export function getPagesCatalogRevision(): string {
  return computePagesCatalogRevision(getShippedPages());
}
