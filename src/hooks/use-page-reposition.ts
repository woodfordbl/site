import { useCallback } from "react";

import type { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { hashPageBlocks } from "@/lib/content/block-hash.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { loadPage } from "@/lib/content/load-page.ts";
import { hasLocalPageDocument } from "@/lib/pages/local-page-document.ts";
import type { PageMetadataSeed } from "@/lib/pages/persist-page-metadata.ts";
import { planPageReposition } from "@/lib/pages/reposition-page.ts";

type PageDispatch = ReturnType<typeof usePageDispatch>;

/** Reparent/reorder a page in the tree; mirrors a sidebar `page.reposition` drop. */
export interface PageRepositionCommand {
  appendPageLinkOnParent: boolean;
  insertBeforePageId?: string | null;
  pageId: string;
  parentId: string | null;
}

/**
 * Shared `page.reposition` dispatcher that lazily seeds any server pages (the
 * moved page, its new siblings, and the link parent) before persisting. Used by
 * both the sidebar drag-drop and the canvas page-drop so the seeding stays in one
 * place. @see docs/architecture/pages.md#sidebar-drag-and-drop
 */
export function usePageReposition(
  pages: PageSummary[],
  dispatch: PageDispatch
): (command: PageRepositionCommand) => void {
  const ensurePageSeed = useCallback(
    async (pageId: string): Promise<PageMetadataSeed | undefined> => {
      if (hasLocalPageDocument(pageId)) {
        return;
      }

      const page = pages.find((candidate) => candidate.id === pageId);
      if (!page) {
        return;
      }

      const loaded = await loadPage({ data: { slug: page.slug } });
      return {
        blocks: loaded.blocks,
        serverBaselineHash: hashPageBlocks(loaded.blocks),
      };
    },
    [pages]
  );

  return useCallback(
    (command: PageRepositionCommand) => {
      let previewPlan: ReturnType<typeof planPageReposition>;
      try {
        previewPlan = planPageReposition({
          appendPageLinkOnParent: command.appendPageLinkOnParent,
          insertBeforePageId: command.insertBeforePageId,
          pageId: command.pageId,
          parentId: command.parentId,
          pages,
        });
      } catch {
        return;
      }

      const scopePageIdsToSeed = previewPlan.scopeSidebarOrderUpdates
        .map((update) => update.pageId)
        .filter((id) => !hasLocalPageDocument(id));

      Promise.all([
        ...scopePageIdsToSeed.map((id) => ensurePageSeed(id)),
        command.parentId && command.appendPageLinkOnParent
          ? ensurePageSeed(command.parentId)
          : Promise.resolve(undefined),
      ])
        .then((results) => {
          const scopeSeedResults = results.slice(0, scopePageIdsToSeed.length);
          const parentSeed = results.at(-1);
          const seedsByPageId: Record<string, PageMetadataSeed> = {};

          for (let index = 0; index < scopePageIdsToSeed.length; index += 1) {
            const scopePageId = scopePageIdsToSeed[index];
            const scopeSeed = scopeSeedResults[index];
            if (scopePageId && scopeSeed) {
              seedsByPageId[scopePageId] = scopeSeed;
            }
          }

          dispatch({
            type: "page.reposition",
            pageId: command.pageId,
            parentId: command.parentId,
            insertBeforePageId: command.insertBeforePageId,
            appendPageLinkOnParent: command.appendPageLinkOnParent,
            seed: seedsByPageId[command.pageId],
            seedsByPageId,
            parentSeed:
              parentSeed && command.parentId && command.appendPageLinkOnParent
                ? parentSeed
                : undefined,
          });
        })
        .catch(() => undefined);
    },
    [dispatch, ensurePageSeed, pages]
  );
}
