import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  dedupePageSegment,
  siblingPages,
} from "@/lib/pages/build-page-tree.ts";
import { mergePageList } from "@/lib/pages/merge-page-list.ts";
import {
  buildChildSlug,
  normalizePageSlug,
  pageSlugsEqual,
  slugifyPageSegment,
} from "@/lib/pages/slugify.ts";
import {
  isLocallyDeletedPage,
  isUserCreatedPage,
  type LocalPage,
} from "@/lib/schemas/local-page.ts";

export function userPageIsDuplicateSlug(
  page: LocalPage,
  userPages: LocalPage[]
): boolean {
  const normalized = normalizePageSlug(page.slug);
  const sameSlug = userPages.filter(
    (candidate) =>
      isUserCreatedPage(candidate) &&
      !isLocallyDeletedPage(candidate) &&
      normalizePageSlug(candidate.slug) === normalized
  );

  if (sameSlug.length <= 1) {
    return false;
  }

  const oldest = [...sameSlug].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
  )[0];

  return oldest.id !== page.id;
}

function computeMigrationSlug(page: LocalPage, pages: PageSummary[]): string {
  const parentId = page.parentId ?? null;
  const title = page.title;
  const segment = slugifyPageSegment(title);

  if (parentId) {
    const parent = pages.find((candidate) => candidate.id === parentId);
    if (!parent) {
      return normalizePageSlug(page.slug);
    }

    const deduped = dedupePageSegment(
      segment,
      siblingPages({ id: page.id, slug: page.slug, title, parentId }, pages)
    );
    return buildChildSlug(parent.slug, deduped);
  }

  const deduped = dedupePageSegment(
    segment,
    siblingPages({ id: page.id, slug: page.slug, title, parentId: null }, pages)
  );
  return normalizePageSlug(deduped);
}

export function planUserPageSlugMigrations(
  serverPages: PageSummary[],
  localPages: LocalPage[]
): Array<{ pageId: string; newSlug: string }> {
  const serverSlugs = new Set(
    serverPages.map((page) => normalizePageSlug(page.slug))
  );
  const activeUserPages = localPages.filter(
    (page) => isUserCreatedPage(page) && !isLocallyDeletedPage(page)
  );

  const migrations: Array<{ pageId: string; newSlug: string }> = [];
  let workingMerged = mergePageList(serverPages, localPages);

  const sorted = [...activeUserPages].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
  );

  for (const page of sorted) {
    const shadowsServer = serverSlugs.has(normalizePageSlug(page.slug));
    const isDuplicate = userPageIsDuplicateSlug(page, activeUserPages);

    if (!(shadowsServer || isDuplicate)) {
      continue;
    }

    const newSlug = computeMigrationSlug(page, workingMerged);
    if (pageSlugsEqual(page.slug, newSlug)) {
      continue;
    }

    migrations.push({ pageId: page.id, newSlug });
    workingMerged = workingMerged.map((summary) =>
      summary.id === page.id ? { ...summary, slug: newSlug } : summary
    );
  }

  return migrations;
}

export function findLegacyUserSlugRedirect(
  pathname: string,
  localPages: LocalPage[]
): string | null {
  if (pathname === "/" || pathname.startsWith("/p/")) {
    return null;
  }

  const normalizedPath = normalizePageSlug(pathname);

  for (const page of localPages) {
    if (!isUserCreatedPage(page) || isLocallyDeletedPage(page)) {
      continue;
    }

    if (pageSlugsEqual(page.slug, normalizedPath)) {
      return page.id;
    }
  }

  return null;
}
