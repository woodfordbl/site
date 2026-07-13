import type { PageSummary } from "@/lib/content/list-pages.ts";
import { resolveDatabaseRowPageTitle } from "@/lib/databases/database-row-page-title.ts";
import {
  findDatabaseHostPageId,
  type HostScanBlock,
} from "@/lib/databases/resolve-database-host-page.ts";
import {
  buildChildSlug,
  normalizePageSlug,
  pageNavTarget,
  pageNavTargetForUserPage,
  parsePagePath,
  slugifyPageSegment,
} from "@/lib/pages/slugify.ts";
import type {
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

export type DatabasePathKind = "hub" | "row" | "template";

export interface ResolvedDatabasePath {
  database: LocalDatabase;
  host: PageSummary;
  kind: DatabasePathKind;
  row?: LocalDatabaseRow;
}

export function resolveDatabaseSlug(database: LocalDatabase): string {
  return database.slug ?? slugifyPageSegment(database.name);
}

export function resolveRowSlug(
  database: LocalDatabase,
  row: LocalDatabaseRow
): string {
  return slugifyPageSegment(resolveDatabaseRowPageTitle(database, row));
}

export function buildDatabaseHubSlug(hostSlug: string, dbSlug: string): string {
  return buildChildSlug(hostSlug, dbSlug);
}

export function buildDatabaseRowSlug(
  hostSlug: string,
  dbSlug: string,
  rowSlug: string
): string {
  return buildChildSlug(buildDatabaseHubSlug(hostSlug, dbSlug), rowSlug);
}

export function buildDatabaseTemplateSlug(
  hostSlug: string,
  dbSlug: string
): string {
  return buildChildSlug(buildDatabaseHubSlug(hostSlug, dbSlug), "template");
}

function pathMatchesPrefix(path: string[], prefix: string[]): boolean {
  return prefix.every((segment, index) => path[index] === segment);
}

function resolveDatabaseHost(
  database: LocalDatabase,
  pages: readonly PageSummary[],
  blocks: readonly HostScanBlock[]
): PageSummary | undefined {
  const hostId = findDatabaseHostPageId({
    blocks,
    databaseId: database.id,
    pages,
  });
  return hostId ? pages.find((page) => page.id === hostId) : undefined;
}

function rowMatchesSlug(
  database: LocalDatabase,
  row: LocalDatabaseRow,
  rowSlug: string,
  pages: readonly PageSummary[]
): boolean {
  if (resolveRowSlug(database, row) === rowSlug) {
    return true;
  }

  const page = row.pageId
    ? pages.find((candidate) => candidate.id === row.pageId)
    : undefined;
  return page ? parsePagePath(page.slug).at(-1) === rowSlug : false;
}

/**
 * Resolves database-owned paths after normal page-slug resolution has failed.
 * Exact page slugs intentionally remain authoritative over database paths.
 */
export function resolveDatabasePathFromSplat(
  splat: string,
  options: {
    blocks: readonly HostScanBlock[];
    databases: readonly LocalDatabase[];
    pages: readonly PageSummary[];
    rows: readonly LocalDatabaseRow[];
  }
): ResolvedDatabasePath | null {
  const path = parsePagePath(normalizePageSlug(splat));
  const candidates = options.databases
    .flatMap((database) => {
      const host = resolveDatabaseHost(database, options.pages, options.blocks);
      return host ? [{ database, host }] : [];
    })
    .sort(
      (left, right) =>
        parsePagePath(right.host.slug).length -
        parsePagePath(left.host.slug).length
    );

  for (const { database, host } of candidates) {
    const hostPath = parsePagePath(host.slug);
    if (!pathMatchesPrefix(path, hostPath)) {
      continue;
    }

    const remainder = path.slice(hostPath.length);
    if (remainder[0] !== resolveDatabaseSlug(database)) {
      continue;
    }
    if (remainder.length === 1) {
      return { database, host, kind: "hub" };
    }
    if (remainder.length === 2 && remainder[1] === "template") {
      return { database, host, kind: "template" };
    }
    if (remainder.length !== 2) {
      continue;
    }

    const row = options.rows.find(
      (candidate) =>
        candidate.databaseId === database.id &&
        rowMatchesSlug(database, candidate, remainder[1], options.pages)
    );
    if (row) {
      return { database, host, kind: "row", row };
    }
  }

  return null;
}

export function resolveDatabasePathNavTarget(
  host: Pick<PageSummary, "routeBy">,
  slug: string
) {
  return host.routeBy === "id"
    ? pageNavTargetForUserPage(slug)
    : pageNavTarget(slug);
}

/** Builds the canonical navigable path for a database hub. */
export function databaseHubNavTarget(
  database: LocalDatabase,
  pages: readonly PageSummary[],
  blocks: readonly HostScanBlock[]
) {
  const host = resolveDatabaseHost(database, pages, blocks);
  if (!host) {
    return null;
  }
  return resolveDatabasePathNavTarget(
    host,
    buildDatabaseHubSlug(host.slug, resolveDatabaseSlug(database))
  );
}

/** Builds the canonical navigable path for a virtual database row. */
export function databaseRowNavTarget(
  database: LocalDatabase,
  row: LocalDatabaseRow,
  pages: readonly PageSummary[],
  blocks: readonly HostScanBlock[]
) {
  const host = resolveDatabaseHost(database, pages, blocks);
  if (!host) {
    return null;
  }
  return resolveDatabasePathNavTarget(
    host,
    buildDatabaseRowSlug(
      host.slug,
      resolveDatabaseSlug(database),
      resolveRowSlug(database, row)
    )
  );
}

/** Builds the canonical navigable path for a database row template. */
export function databaseTemplateNavTarget(
  database: LocalDatabase,
  pages: readonly PageSummary[],
  blocks: readonly HostScanBlock[]
) {
  const host = resolveDatabaseHost(database, pages, blocks);
  if (!host) {
    return null;
  }
  return resolveDatabasePathNavTarget(
    host,
    buildDatabaseTemplateSlug(host.slug, resolveDatabaseSlug(database))
  );
}
