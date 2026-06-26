import { hashPageBlocks } from "@/lib/content/block-hash.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { hashPageMetadata } from "@/lib/content/page-metadata-hash.ts";
import { mergePageList } from "@/lib/pages/merge-page-list.ts";
import {
  isLocallyDeletedPage,
  isUserCreatedPage,
  type LocalPage,
} from "@/lib/schemas/local-page.ts";
import type { Page } from "@/lib/schemas/page.ts";

export type PageOrigin =
  | "server"
  | "server-overridden"
  | "user"
  | "tombstoned"
  | "orphaned";

export interface ResolvedPageState {
  isDirty: boolean;
  isMetadataStale: boolean;
  isStale: boolean;
  localPage: LocalPage | null;
  origin: PageOrigin;
  serverPage: Page | null;
  summary: PageSummary;
}

export function resolvePageOrigin(
  serverPage: Page | null,
  localPage: LocalPage | null
): PageOrigin {
  if (!localPage) {
    return serverPage ? "server" : "orphaned";
  }

  if (isLocallyDeletedPage(localPage)) {
    return "tombstoned";
  }

  if (isUserCreatedPage(localPage)) {
    return "user";
  }

  if (serverPage) {
    return "server-overridden";
  }

  return "orphaned";
}

export function isLocalPageDirty(localPage: LocalPage | null): boolean {
  if (!localPage) {
    return false;
  }

  return !isLocallyDeletedPage(localPage);
}

export function computePageStaleState(
  serverPage: Page | null,
  localPage: LocalPage | null
): { isMetadataStale: boolean; isStale: boolean } {
  if (!(serverPage && localPage) || isLocallyDeletedPage(localPage)) {
    return { isMetadataStale: false, isStale: false };
  }

  if (localPage.serverBaselineHash == null) {
    return { isMetadataStale: false, isStale: false };
  }

  const currentBlockHash = hashPageBlocks(serverPage.blocks);
  const blocksStale = localPage.serverBaselineHash !== currentBlockHash;

  const currentMetadataHash = hashPageMetadata({
    icon: serverPage.icon,
    parentId: serverPage.parentId,
    sidebarOrder: serverPage.sidebarOrder,
    slug: serverPage.slug,
    title: serverPage.title,
  });
  const metadataStale =
    localPage.serverMetadataBaseline != null &&
    localPage.serverMetadataBaseline !== currentMetadataHash;

  return {
    isMetadataStale: metadataStale,
    isStale: blocksStale || metadataStale,
  };
}

export function resolvePageState(
  summary: PageSummary,
  serverPage: Page | null,
  localPage: LocalPage | null
): ResolvedPageState {
  const origin = resolvePageOrigin(serverPage, localPage);
  const stale = computePageStaleState(serverPage, localPage);

  return {
    origin,
    summary,
    serverPage,
    localPage,
    isDirty: isLocalPageDirty(localPage),
    isStale: stale.isStale,
    isMetadataStale: stale.isMetadataStale,
  };
}

export function resolvePageCatalog(
  serverPages: PageSummary[],
  localPages: LocalPage[],
  serverPagesById: Map<string, Page> = new Map()
): ResolvedPageState[] {
  const localById = new Map(localPages.map((page) => [page.id, page]));
  const summaries = mergePageList(serverPages, localPages);

  return summaries.map((summary) =>
    resolvePageState(
      summary,
      serverPagesById.get(summary.id) ?? null,
      localById.get(summary.id) ?? null
    )
  );
}

/**
 * True when a locally-overridden shipped page's body diverges from the current
 * shipped content (the author posted new content). Content-only by design: it
 * compares `serverBaselineHash` to the catalog `contentHash` so a global refresh
 * never nags users over metadata-only hash differences.
 */
export function isOverriddenSummaryContentStale(
  summary: PageSummary,
  localPage: LocalPage | null
): boolean {
  if (
    !localPage ||
    isLocallyDeletedPage(localPage) ||
    isUserCreatedPage(localPage)
  ) {
    return false;
  }

  if (localPage.serverBaselineHash == null || summary.contentHash == null) {
    return false;
  }

  return localPage.serverBaselineHash !== summary.contentHash;
}

/** Ids of overridden shipped pages whose shipped content changed since the local copy. */
export function findStaleOverriddenPageIds(
  serverSummaries: PageSummary[],
  localPages: LocalPage[]
): string[] {
  const localById = new Map(localPages.map((page) => [page.id, page]));
  const stale: string[] = [];

  for (const summary of serverSummaries) {
    if (
      isOverriddenSummaryContentStale(
        summary,
        localById.get(summary.id) ?? null
      )
    ) {
      stale.push(summary.id);
    }
  }

  return stale;
}

export function findOrphanLocalPages(
  serverPages: PageSummary[],
  localPages: LocalPage[]
): LocalPage[] {
  const serverIds = new Set(serverPages.map((page) => page.id));

  return localPages.filter((localPage) => {
    if (isLocallyDeletedPage(localPage)) {
      return false;
    }

    if (isUserCreatedPage(localPage)) {
      return false;
    }

    return !serverIds.has(localPage.id);
  });
}

export function prefersLocalBlockSource(origin: PageOrigin): boolean {
  switch (origin) {
    case "server-overridden":
    case "user":
    case "orphaned":
      return true;
    case "server":
    case "tombstoned":
      return false;
    default: {
      const exhaustive: never = origin;
      return exhaustive;
    }
  }
}
