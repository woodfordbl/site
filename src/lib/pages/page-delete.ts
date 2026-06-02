import type { PageSummary } from "@/lib/content/list-pages.ts";
import { collectDescendantPageIds } from "@/lib/pages/build-page-tree.ts";
import {
  isLocallyDeletedPage,
  isUserCreatedPage,
  type LocalPage,
} from "@/lib/schemas/local-page.ts";

/** Baseline hash for server-page tombstones created without a prior lazy seed. */
export const LOCAL_DELETE_BASELINE_HASH = "local-delete-tombstone";

export function resolvePageDeleteTargets(
  pageId: string,
  pages: PageSummary[]
): string[] {
  return [pageId, ...collectDescendantPageIds(pageId, pages)];
}

export function canDeletePage(pageId: string, pages: PageSummary[]): boolean {
  const page = pages.find((candidate) => candidate.id === pageId);
  if (!page || page.slug === "/") {
    return false;
  }

  const targets = new Set(resolvePageDeleteTargets(pageId, pages));
  const remaining = pages.filter((candidate) => !targets.has(candidate.id));
  return remaining.length >= 1;
}

export function isHardDeleteLocalPage(localPage: LocalPage | null): boolean {
  return (
    localPage != null &&
    isUserCreatedPage(localPage) &&
    !isLocallyDeletedPage(localPage)
  );
}
