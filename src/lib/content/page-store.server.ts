import { computePagesCatalogRevision } from "@/lib/content/pages-catalog-revision.ts";
import { ensureShippedPagesCache } from "@/lib/content/shipped-pages-cache.ts";
import { type Page, pageSchema } from "@/lib/schemas/page.ts";

/**
 * Shipped pages, bundled at build time. Runtime `readFile(process.cwd(), …)`
 * is not portable to deployed server functions (the content directory is not
 * traced into the bundle); the glob guarantees inclusion and stays HMR-aware
 * for author dev mode saves.
 */
const pageModules = import.meta.glob("../../../content/pages/**/*.json", {
  eager: true,
  import: "default",
});

const CONTENT_PREFIX = "content/pages/";

function getPagesByRelativePath(): Map<string, Page> {
  return ensureShippedPagesCache(
    () =>
      new Map(
        Object.entries(pageModules).map(([modulePath, moduleData]) => {
          const relativePath = modulePath.slice(
            modulePath.indexOf(CONTENT_PREFIX) + CONTENT_PREFIX.length
          );
          return [relativePath, pageSchema.parse(moduleData)];
        })
      )
  );
}

export function getShippedPages(): Page[] {
  return [...getPagesByRelativePath().values()];
}

/** Lookup by `slugToRelativePath` output (e.g. `home.json`, `previous-work/altitude.json`). */
export function getShippedPageByRelativePath(
  relativePath: string
): Page | undefined {
  return getPagesByRelativePath().get(relativePath);
}
