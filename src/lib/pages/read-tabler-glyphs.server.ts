import type { TablerIconCatalogItem } from "@/lib/pages/page-icon.ts";
import type { TablerIconGlyph } from "@/lib/pages/page-icon-catalog.ts";

let catalogListCache: TablerIconCatalogItem[] | null = null;

/**
 * The icon catalog is bundled into the server build (lazy chunk) — runtime
 * filesystem reads from `public/` are not available in deployed functions.
 */
async function readTablerCatalogList(): Promise<TablerIconCatalogItem[]> {
  if (catalogListCache) {
    return catalogListCache;
  }

  const module = await import("@/generated/tabler-icons.json");
  catalogListCache = module.default as TablerIconCatalogItem[];
  return catalogListCache;
}

/** Reads only the glyphs needed for SSR sidebar first paint. */
export async function readTablerGlyphsByNames(
  names: string[]
): Promise<Record<string, TablerIconGlyph>> {
  if (names.length === 0) {
    return {};
  }

  const list = await readTablerCatalogList();
  const byName = new Map(list.map((item) => [item.name, item]));
  const glyphs: Record<string, TablerIconGlyph> = {};

  for (const name of names) {
    const item = byName.get(name);
    if (item) {
      glyphs[name] = { node: item.node, filled: item.filled };
    }
  }

  return glyphs;
}
