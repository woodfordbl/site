import {
  readDocumentCookie,
  writeDocumentCookie,
} from "@/lib/cookies/document-cookie.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";
import { isLocallyDeletedPage } from "@/lib/schemas/local-page.ts";

/** Cookie mirror of local page sidebar metadata for SSR first paint (`site-page-list-local`). */
export const PAGE_LIST_LOCAL_PREVIEW_COOKIE_NAME = "site-page-list-local";

/** Minimal local page fields needed to render the sidebar tree on SSR. */
export interface LocalPagePreviewEntry {
  icon?: string;
  id: string;
  parentId: string | null;
  serverBaselineHash: string | null;
  sidebarOrder?: number;
  slug: string;
  title: string;
}

export function toLocalPagePreviewEntry(
  page: LocalPage
): LocalPagePreviewEntry {
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    icon: page.icon,
    parentId: page.parentId,
    serverBaselineHash: page.serverBaselineHash,
    sidebarOrder: page.sidebarOrder,
  };
}

/** Includes shipped-page overlays (custom icons/titles) and user-created pages. */
export function localPagePreviewEntriesFromPages(
  pages: LocalPage[]
): LocalPagePreviewEntry[] {
  return pages
    .filter((page) => !isLocallyDeletedPage(page))
    .map(toLocalPagePreviewEntry);
}

/** Parses the SSR sidebar preview cookie (defaults to empty). */
export function parsePageListLocalPreviewCookie(
  value: string | undefined
): LocalPagePreviewEntry[] {
  if (!value || value.trim() === "") {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) => {
      if (
        typeof entry !== "object" ||
        entry === null ||
        typeof entry.id !== "string" ||
        typeof entry.slug !== "string" ||
        typeof entry.title !== "string" ||
        !("parentId" in entry) ||
        (entry.parentId !== null && typeof entry.parentId !== "string")
      ) {
        return [];
      }

      return [
        {
          id: entry.id,
          slug: entry.slug,
          title: entry.title,
          parentId: entry.parentId,
          serverBaselineHash:
            typeof entry.serverBaselineHash === "string"
              ? entry.serverBaselineHash
              : null,
          icon: typeof entry.icon === "string" ? entry.icon : undefined,
          sidebarOrder:
            typeof entry.sidebarOrder === "number"
              ? entry.sidebarOrder
              : undefined,
        } satisfies LocalPagePreviewEntry,
      ];
    });
  } catch {
    return [];
  }
}

export function serializePageListLocalPreviewCookie(
  entries: LocalPagePreviewEntry[]
): string | null {
  if (entries.length === 0) {
    return null;
  }

  return JSON.stringify(entries);
}

export function readPageListLocalPreviewFromDocument(): LocalPagePreviewEntry[] {
  return parsePageListLocalPreviewCookie(
    readDocumentCookie(PAGE_LIST_LOCAL_PREVIEW_COOKIE_NAME)
  );
}

/**
 * User-created pages first (they affect routing on first paint), shipped-page
 * overlays after (cosmetic title/icon) — so over-budget truncation drops the
 * least important entries.
 */
function entriesByPreviewPriority(
  entries: LocalPagePreviewEntry[]
): LocalPagePreviewEntry[] {
  return [...entries].sort((left, right) => {
    const leftUser = left.serverBaselineHash === null ? 0 : 1;
    const rightUser = right.serverBaselineHash === null ? 0 : 1;
    return leftUser - rightUser;
  });
}

/**
 * Browsers silently drop cookie writes over ~4 KB, which would freeze a stale
 * sidebar preview forever. When the full mirror exceeds the budget, write the
 * highest-priority prefix that fits — SSR paints a best-known subset and the
 * client reconciles after hydration.
 */
export function writePageListLocalPreviewToDocument(
  entries: LocalPagePreviewEntry[]
): void {
  let candidates = entriesByPreviewPriority(entries);

  while (candidates.length > 0) {
    const serialized = serializePageListLocalPreviewCookie(candidates);
    if (writeDocumentCookie(PAGE_LIST_LOCAL_PREVIEW_COOKIE_NAME, serialized)) {
      return;
    }
    candidates = candidates.slice(0, -1);
  }

  writeDocumentCookie(PAGE_LIST_LOCAL_PREVIEW_COOKIE_NAME, null);
}

export function writePageListLocalPreviewFromPages(pages: LocalPage[]): void {
  writePageListLocalPreviewToDocument(localPagePreviewEntriesFromPages(pages));
}

/** Converts preview entries into `LocalPage` stubs for `mergePageList`. */
export function localPagesFromPreviewEntries(
  entries: LocalPagePreviewEntry[]
): LocalPage[] {
  const timestamp = "1970-01-01T00:00:00.000Z";

  return entries.map((entry) => ({
    id: entry.id,
    slug: entry.slug,
    title: entry.title,
    icon: entry.icon,
    parentId: entry.parentId,
    sidebarOrder: entry.sidebarOrder,
    serverBaselineHash: entry.serverBaselineHash,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}
