import {
  readDocumentCookie,
  writeDocumentCookie,
} from "@/lib/cookies/document-cookie.ts";
import { readDirtyPageIdsFromDocument } from "@/lib/local-draft/dirty-pages-cookie.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";
import {
  isLocallyDeletedPage,
  isUserCreatedPage,
} from "@/lib/schemas/local-page.ts";

/** Cookie mirror of local page sidebar metadata for SSR first paint (`site-page-list-local`). */
export const PAGE_LIST_LOCAL_PREVIEW_COOKIE_NAME = "site-page-list-local";

/** Minimal local page fields needed to render the sidebar tree on SSR. */
export interface LocalPagePreviewEntry {
  /** When set, the shipped page is hidden locally (see {@link mergePageList}). */
  deletedAt?: string;
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
    deletedAt: page.deletedAt,
  };
}

/**
 * Dirty overlays, user-created pages, and delete tombstones for SSR sidebar
 * merge. Materialized row pages and database hubs are excluded: they are
 * never sidebar-visible, so mirroring them would only spend cookie budget
 * and leak unmarked stubs into the SSR tree.
 */
export function localPagePreviewEntriesFromPages(
  pages: LocalPage[]
): LocalPagePreviewEntry[] {
  const dirtyPageIds = readDirtyPageIdsFromDocument();

  return pages
    .filter(
      (page) =>
        page.databaseRowSource === undefined &&
        page.databaseSource === undefined &&
        (isLocallyDeletedPage(page) ||
          isUserCreatedPage(page) ||
          dirtyPageIds.has(page.id))
    )
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
          deletedAt:
            typeof entry.deletedAt === "string" ? entry.deletedAt : undefined,
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

function previewEntryPriority(entry: LocalPagePreviewEntry): number {
  if (entry.deletedAt != null) {
    return 0;
  }

  if (entry.serverBaselineHash === null) {
    return 1;
  }

  return 2;
}

/**
 * Delete tombstones first (sidebar visibility), user pages next (routing),
 * shipped-page overlays last (cosmetic title/icon) — over-budget truncation
 * drops the least important entries.
 */
function entriesByPreviewPriority(
  entries: LocalPagePreviewEntry[]
): LocalPagePreviewEntry[] {
  return [...entries].sort(
    (left, right) => previewEntryPriority(left) - previewEntryPriority(right)
  );
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

/** Mirrors the live collection into the SSR preview cookie (client-only). */
export function syncPageListLocalPreviewFromCollection(
  pages: LocalPage[]
): void {
  if (typeof window === "undefined") {
    return;
  }

  writePageListLocalPreviewFromPages(pages);
}

/** Converts preview entries into `LocalPage` stubs for `mergePageList`. */
export function localPagesFromPreviewEntries(
  entries: LocalPagePreviewEntry[] | undefined
): LocalPage[] {
  if (!entries) {
    return [];
  }

  const timestamp = "1970-01-01T00:00:00.000Z";

  return entries.map((entry) => ({
    id: entry.id,
    slug: entry.slug,
    title: entry.title,
    icon: entry.icon,
    parentId: entry.parentId,
    sidebarOrder: entry.sidebarOrder,
    serverBaselineHash: entry.serverBaselineHash,
    deletedAt: entry.deletedAt,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}
