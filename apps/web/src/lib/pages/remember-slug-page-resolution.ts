import { normalizePageSlug } from "@/lib/pages/slugify.ts";

const SESSION_PREFIX = "site-resolved-page:";

function getHmrPersistedMap(): Map<string, string> {
  const hotData = import.meta.hot?.data;
  if (hotData?.resolvedPageIdBySlug instanceof Map) {
    return hotData.resolvedPageIdBySlug;
  }

  const map = new Map<string, string>();
  if (hotData) {
    hotData.resolvedPageIdBySlug = map;
  }

  return map;
}

const resolvedPageIdBySlugCache = getHmrPersistedMap();

function sessionKey(slug: string): string {
  return `${SESSION_PREFIX}${normalizePageSlug(slug)}`;
}

/** Remembers a slug → page id match so remounts/HMR can resolve renamed pages from the URL. */
export function rememberSlugPageResolution(slug: string, pageId: string): void {
  const normalized = normalizePageSlug(slug);
  resolvedPageIdBySlugCache.set(normalized, pageId);

  if (typeof window !== "undefined") {
    sessionStorage.setItem(sessionKey(normalized), pageId);
  }
}

/** Last page id resolved for a URL slug (in-memory HMR cache, then sessionStorage). */
export function getRememberedSlugPageId(slug: string): string | null {
  const normalized = normalizePageSlug(slug);
  const fromMemory = resolvedPageIdBySlugCache.get(normalized);
  if (fromMemory) {
    return fromMemory;
  }

  if (typeof window === "undefined") {
    return null;
  }

  return sessionStorage.getItem(sessionKey(normalized));
}
