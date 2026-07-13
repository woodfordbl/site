import {
  assembleMarkdownPages,
  type RawPageFile,
} from "@/lib/content/assemble-markdown-pages.ts";
import { isDevDiskMode } from "@/lib/content/dev-disk/dev-disk-mode.ts";
import { computePagesCatalogRevision } from "@/lib/content/pages-catalog-revision.ts";
import type { Page } from "@/lib/schemas/page.ts";

/**
 * Shipped pages, bundled at build time as raw markdown. Runtime
 * `readFile(process.cwd(), …)` is not portable to deployed server functions
 * (the content directory is not traced into the bundle); the glob guarantees
 * inclusion. In dev disk mode reads come fresh from the filesystem instead —
 * the Vite watcher ignores `content/`, so the glob would go stale there.
 */
const pageModules = import.meta.glob("../../../content/pages/**/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

const CONTENT_PREFIX = "content/pages/";

let cachedPagesBySlug: Map<string, Page> | null = null;

function getBundledPagesBySlug(): Map<string, Page> {
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

/** Dev-only fs read, memoized on a (path, mtime, size) catalog fingerprint. */
let devCache: { fingerprint: string; pages: Map<string, Page> } | null = null;

async function getDevPagesBySlug(): Promise<Map<string, Page>> {
  const { readPageFilesWithStats } = await import(
    "@/lib/content/content-pages-fs.server.ts"
  );
  const { files, fingerprint } = await readPageFilesWithStats();
  if (devCache && devCache.fingerprint === fingerprint) {
    return devCache.pages;
  }
  const pages = new Map(
    assembleMarkdownPages(files).map((page) => [page.slug, page])
  );
  devCache = { fingerprint, pages };
  return pages;
}

function getPagesBySlug(): Promise<Map<string, Page>> {
  if (isDevDiskMode()) {
    return getDevPagesBySlug();
  }
  return Promise.resolve(getBundledPagesBySlug());
}

export async function getShippedPages(): Promise<Page[]> {
  return [...(await getPagesBySlug()).values()];
}

/** Lookup by normalized metadata slug (e.g. `/`, `/previous-work/altitude`). */
export async function getShippedPageBySlug(
  slug: string
): Promise<Page | undefined> {
  return (await getPagesBySlug()).get(slug);
}

/** Revision token for the shipped catalog; exposed to the client for deploy freshness. */
export async function getPagesCatalogRevision(): Promise<string> {
  return computePagesCatalogRevision(await getShippedPages());
}
