import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import {
  deleteAllBlocksForPage,
  seedPageBlocks,
} from "@/db/queries/block-collection-ops.ts";
import { useLocalPages } from "@/hooks/use-local-pages.ts";
import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import type { PageCommand } from "@/lib/canvas/commands.ts";
import type { PageEffect } from "@/lib/canvas/effects.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { pageListQueryOptions } from "@/lib/content/page-list-query.ts";
import { markPageClean } from "@/lib/local-draft/dirty-pages-cookie.ts";
import { allocateUserPageSlug } from "@/lib/pages/allocate-page-slug.ts";
import {
  assertPageCanHaveChild,
  pagesById,
} from "@/lib/pages/build-page-tree.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";
import { mergePageList } from "@/lib/pages/merge-page-list.ts";
import {
  canDeletePage,
  isHardDeleteLocalPage,
  LOCAL_DELETE_BASELINE_HASH,
  resolvePageDeleteTargets,
} from "@/lib/pages/page-delete.ts";
import { persistPageMetadata } from "@/lib/pages/persist-page-metadata.ts";
import { normalizePageSlug, pageNavTargetById } from "@/lib/pages/slugify.ts";
import { syncPageUrl } from "@/lib/pages/sync-url.ts";
import type { Block } from "@/lib/schemas/block.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";

function createId(): string {
  return crypto.randomUUID();
}

function deleteLocalPage(pageId: string, pages: PageSummary[]): void {
  const summary = pages.find((page) => page.id === pageId);
  const localPage =
    localPagesCollection.toArray.find((page) => page.id === pageId) ?? null;
  const now = new Date().toISOString();

  deleteAllBlocksForPage(readBlockShardForPage(pageId));
  markPageClean(pageId);

  if (isHardDeleteLocalPage(localPage)) {
    localPagesCollection.delete(pageId);
    return;
  }

  if (localPage) {
    localPagesCollection.update(pageId, (draft) => {
      draft.deletedAt = now;
      draft.updatedAt = now;
    });
    return;
  }

  if (!summary) {
    return;
  }

  localPagesCollection.insert({
    id: summary.id,
    slug: summary.slug,
    title: summary.title,
    parentId: summary.parentId,
    serverBaselineHash: LOCAL_DELETE_BASELINE_HASH,
    deletedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

function resolveCreatePage(
  command: Extract<PageCommand, { type: "page.create" }>,
  pages: PageSummary[],
  pageId: string
): {
  parentId: string | null;
  slug: string;
  title: string;
} {
  const title = command.title ?? DEFAULT_PAGE_TITLE;
  const parentId = command.parentId ?? null;

  if (parentId) {
    const parent = pagesById(pages).get(parentId);
    if (!parent) {
      throw new Error("Parent page not found");
    }

    assertPageCanHaveChild(parent, pages);
  }

  const slug =
    command.slug ??
    allocateUserPageSlug({
      title,
      parentId,
      pageId,
      pages,
    });

  return { parentId, slug, title };
}

export function pageReducer(
  command: PageCommand,
  pages: PageSummary[] = []
): { effects: PageEffect[] } {
  switch (command.type) {
    case "page.create": {
      const id = command.pageId ?? createId();
      const { parentId, slug, title } = resolveCreatePage(command, pages, id);
      return {
        effects: [
          {
            type: "page.persist",
            pageId: id,
            slug,
            title,
            parentId,
            create: true,
            initialBlocks: command.initialBlocks,
          },
          ...(command.navigate === false
            ? []
            : [{ type: "navigate", pageId: id } satisfies PageEffect]),
        ],
      };
    }
    case "page.update": {
      const title = command.title.trim() || DEFAULT_PAGE_TITLE;
      return {
        effects: [
          {
            type: "page.persist",
            pageId: command.pageId,
            slug: command.slug ?? "",
            title,
            create: false,
            previousSlug: command.previousSlug,
          },
        ],
      };
    }
    case "page.delete": {
      if (!canDeletePage(command.pageId, pages)) {
        return { effects: [] };
      }

      const targets = resolvePageDeleteTargets(command.pageId, pages);
      return {
        effects: targets.map(
          (pageId) => ({ type: "page.delete", pageId }) satisfies PageEffect
        ),
      };
    }
    default:
      return { effects: [] };
  }
}

function readLiveLocalPages(): LocalPage[] {
  if (typeof window === "undefined") {
    return [];
  }

  return localPagesCollection.toArray;
}

function mergeDispatchPages(
  serverPages: PageSummary[],
  localPages: LocalPage[]
): PageSummary[] {
  return mergePageList(serverPages, localPages);
}

export function usePageDispatch(pages: PageSummary[] = []) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const localPages = useLocalPages();
  const { data: serverPages = [] } = useQuery(pageListQueryOptions);

  const mergedPages = useMemo(() => {
    if (serverPages.length > 0) {
      return mergeDispatchPages(serverPages, localPages);
    }

    return pages;
  }, [localPages, pages, serverPages]);

  const applyEffects = useCallback(
    (effects: PageEffect[], dispatchPages: PageSummary[]) => {
      const now = new Date().toISOString();

      for (const effect of effects) {
        switch (effect.type) {
          case "page.persist": {
            const slug = normalizePageSlug(effect.slug);

            if (effect.create) {
              const defaultBlock = createEmptyBlock("text");
              const blocksToSeed: Block[] =
                effect.initialBlocks && effect.initialBlocks.length > 0
                  ? effect.initialBlocks
                  : [defaultBlock];

              localPagesCollection.insert({
                id: effect.pageId,
                slug,
                title: effect.title,
                parentId: effect.parentId ?? null,
                serverBaselineHash: null,
                createdAt: now,
                updatedAt: now,
              });
              seedPageBlocks(effect.pageId, blocksToSeed);
              break;
            }

            persistPageMetadata({
              pageId: effect.pageId,
              previousSlug: effect.previousSlug,
              slug: effect.slug,
              title: effect.title,
              pages: dispatchPages,
            });
            break;
          }
          case "page.delete":
            deleteLocalPage(effect.pageId, dispatchPages);
            break;
          case "navigate":
            if (effect.mode === "history") {
              syncPageUrl(effect.slug);
              break;
            }

            navigate({
              ...pageNavTargetById(effect.pageId),
              replace: true,
            });
            break;
          default:
            break;
        }
      }
    },
    [navigate]
  );

  return useCallback(
    (command: PageCommand) => {
      if (command.type === "page.create") {
        queryClient
          .ensureQueryData(pageListQueryOptions)
          .then((freshServerPages) => {
            const dispatchPages = mergeDispatchPages(
              freshServerPages,
              readLiveLocalPages()
            );
            const { effects } = pageReducer(command, dispatchPages);
            applyEffects(effects, dispatchPages);
          })
          .catch(() => {
            // Page create falls back to mergedPages when the list query fails.
          });
        return;
      }

      const { effects } = pageReducer(command, mergedPages);
      applyEffects(effects, mergedPages);
    },
    [applyEffects, mergedPages, queryClient]
  );
}
