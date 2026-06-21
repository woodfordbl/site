import type { PageSummary } from "@/lib/content/list-pages.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";
import { MAX_PAGE_DEPTH } from "@/lib/pages/page-depth.ts";
import { comparePageSiblings } from "@/lib/pages/page-sidebar-order.ts";
import {
  getPageSegment,
  normalizePageSlug,
  parsePagePath,
} from "@/lib/pages/slugify.ts";

/** Nested sidebar tree node (`children` sorted by `comparePageSiblings`). */
export interface PageRow {
  children: PageRow[];
  page: PageSummary;
  sortOrder: number;
}

export function pagesById(pages: PageSummary[]): Map<string, PageSummary> {
  return new Map(pages.map((page) => [page.id, page]));
}

function pagesInScope(
  pages: PageSummary[],
  parentId: string | null
): PageSummary[] {
  return pages.filter((page) => (page.parentId ?? null) === parentId);
}

function buildPageRow(
  page: PageSummary,
  sortOrder: number,
  children: PageRow[]
): PageRow {
  return { page, sortOrder, children };
}

function mergeSiblingScope(
  pages: PageSummary[],
  parentId: string | null
): PageRow[] {
  const siblings = pagesInScope(pages, parentId).sort(comparePageSiblings);

  return siblings.map((page, index) =>
    buildPageRow(page, index, mergeSiblingScope(pages, page.id))
  );
}

/** Builds the nested sidebar tree from flat `PageSummary` rows (`parentId` scopes). */
export function buildPageTree(pages: PageSummary[]): PageRow[] {
  return mergeSiblingScope(pages, null);
}

export function getPageDepth(
  page: PageSummary,
  pageMap: Map<string, PageSummary>
): number {
  const segments = parsePagePath(page.slug);
  if (segments.length > 0) {
    return segments.length;
  }

  let depth = 0;
  let current: PageSummary | undefined = page;

  while (current?.parentId) {
    depth += 1;
    current = pageMap.get(current.parentId);
  }

  return depth;
}

export function assertPageCanHaveChild(
  parent: PageSummary,
  pages: PageSummary[]
): void {
  const pageMap = pagesById(pages);
  const parentDepth = getPageDepth(parent, pageMap);

  if (parentDepth >= MAX_PAGE_DEPTH) {
    throw new Error(
      `Pages cannot be nested deeper than ${MAX_PAGE_DEPTH} segments`
    );
  }
}

export function getAncestorPageIds(
  pageId: string,
  pages: PageSummary[]
): string[] {
  const pageMap = pagesById(pages);
  const ancestors: string[] = [];
  let current = pageMap.get(pageId);

  while (current?.parentId) {
    ancestors.push(current.parentId);
    current = pageMap.get(current.parentId);
  }

  return ancestors;
}

export function collectDescendantPageIds(
  pageId: string,
  pages: PageSummary[]
): string[] {
  const descendants: string[] = [];

  for (const page of pages) {
    if (page.parentId === pageId) {
      descendants.push(page.id);
      descendants.push(...collectDescendantPageIds(page.id, pages));
    }
  }

  return descendants;
}

export function replacePageSlugPrefix(
  oldPrefix: string,
  newPrefix: string,
  slug: string
): string {
  if (oldPrefix === newPrefix) {
    return slug;
  }

  if (slug === oldPrefix) {
    return newPrefix;
  }

  const prefixWithSlash = oldPrefix.endsWith("/") ? oldPrefix : `${oldPrefix}/`;

  if (!slug.startsWith(prefixWithSlash)) {
    return slug;
  }

  const suffix = slug.slice(prefixWithSlash.length);
  if (newPrefix === "/") {
    return `/${suffix}`;
  }

  return `${newPrefix}/${suffix}`;
}

/**
 * Replaces the last slug segment from a title, deduped among siblings; home stays `/`.
 * @see docs/architecture/pages.md#title-editing
 */
export function buildSlugFromTitle(
  page: PageSummary,
  pages: PageSummary[],
  title: string,
  slugifySegment: (value: string) => string
): string {
  if (normalizePageSlug(page.slug) === "/") {
    return "/";
  }

  const pageMap = pagesById(pages);
  const parent = page.parentId ? pageMap.get(page.parentId) : undefined;
  let parentPrefix: string | null = null;

  if (parent && parent.slug !== "/") {
    parentPrefix = parent.slug;
  } else if (page.parentId) {
    parentPrefix = "/";
  }

  const siblings = siblingPages(page, pages);
  const segment = dedupePageSegment(
    slugifySegment(title.trim() || DEFAULT_PAGE_TITLE),
    siblings
  );

  if (!parentPrefix) {
    return `/${segment}`;
  }

  if (parentPrefix === "/") {
    return `/${segment}`;
  }

  return `${parentPrefix}/${segment}`;
}

export function siblingPages(
  page: PageSummary,
  pages: PageSummary[]
): PageSummary[] {
  return pages.filter(
    (candidate) =>
      candidate.id !== page.id &&
      (candidate.parentId ?? null) === (page.parentId ?? null)
  );
}

export function dedupePageSegment(
  segment: string,
  siblings: PageSummary[]
): string {
  const taken = new Set(siblings.map((page) => getPageSegment(page.slug)));

  if (!taken.has(segment)) {
    return segment;
  }

  let index = 2;
  while (taken.has(`${segment}-${index}`)) {
    index += 1;
  }

  return `${segment}-${index}`;
}
