import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import {
  deleteAllBlocksForPage,
  seedPageBlocks,
} from "@/db/queries/block-collection-ops.ts";
import { clearPageSnapshots } from "@/db/snapshots/page-snapshot-store.ts";
import { useLocalPages } from "@/hooks/use-local-pages.ts";
import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import type { PageCommand } from "@/lib/canvas/commands.ts";
import type { PageEffect } from "@/lib/canvas/effects.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { pageListQueryOptions } from "@/lib/content/page-list-query.ts";
import { markPageClean } from "@/lib/local-draft/dirty-pages-cookie.ts";
import { allocateUserPageSlug } from "@/lib/pages/allocate-page-slug.ts";
import { appendChildPageLinkFromShard } from "@/lib/pages/append-page-link-on-parent.ts";
import {
  assertPageCanHaveChild,
  pagesById,
} from "@/lib/pages/build-page-tree.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";
import { deletePageLinkReferences } from "@/lib/pages/delete-page-link-references.ts";
import { mergePageList } from "@/lib/pages/merge-page-list.ts";
import {
  canDeletePage,
  isHardDeleteLocalPage,
  LOCAL_DELETE_BASELINE_HASH,
  resolvePageDeleteTargets,
} from "@/lib/pages/page-delete.ts";
import { syncPageListLocalPreviewFromCollection } from "@/lib/pages/page-list-local-preview-cookie.ts";
import {
  computeSidebarOrderForInsertAfter,
  sortPagesInScope,
} from "@/lib/pages/page-sidebar-order.ts";
import { persistPageMetadata } from "@/lib/pages/persist-page-metadata.ts";
import { persistPageReposition } from "@/lib/pages/persist-page-reposition.ts";
import { planPageReposition } from "@/lib/pages/reposition-page.ts";
import { resetAllToRemote } from "@/lib/pages/reset-all-to-remote.ts";
import { resetPageToRemote } from "@/lib/pages/reset-page-to-remote.ts";
import { purgeSlugTombstonesForUserPageCreate } from "@/lib/pages/resolve-user-page-by-slug.ts";
import {
  normalizePageSlug,
  pageNavTarget,
  pageNavTargetForUserPage,
} from "@/lib/pages/slugify.ts";
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
    clearPageSnapshots(pageId).catch(() => undefined);
    syncPageListLocalPreviewFromCollection(localPagesCollection.toArray);
    return;
  }

  if (localPage) {
    localPagesCollection.update(pageId, (draft) => {
      draft.deletedAt = now;
      draft.updatedAt = now;
    });
    syncPageListLocalPreviewFromCollection(localPagesCollection.toArray);
    return;
  }

  if (!summary) {
    return;
  }

  localPagesCollection.insert({
    id: summary.id,
    slug: summary.slug,
    title: summary.title,
    icon: summary.icon,
    parentId: summary.parentId,
    serverBaselineHash: LOCAL_DELETE_BASELINE_HASH,
    deletedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  syncPageListLocalPreviewFromCollection(localPagesCollection.toArray);
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

/**
 * Maps `PageCommand` to `PageEffect` (create, update, delete, reposition).
 * `page.create` purges same-scope slug tombstones before insert, then adds `navigate`
 * with `userPage: true` unless `navigate: false`.
 * @see docs/reference/page-commands.md
 * Invalid `page.reposition` plans return `{ effects: [] }`.
 * @see docs/reference/page-commands.md
 */
export function pageReducer(
  command: PageCommand,
  pages: PageSummary[] = []
): { effects: PageEffect[] } {
  switch (command.type) {
    case "page.create": {
      const id = command.pageId ?? createId();
      const { parentId, slug, title } = resolveCreatePage(command, pages, id);
      const sidebarOrder = command.insertAfterPageId
        ? computeSidebarOrderForInsertAfter({
            siblings: sortPagesInScope(pages, parentId, id),
            insertAfterPageId: command.insertAfterPageId,
          })
        : undefined;
      return {
        effects: [
          {
            type: "page.persist",
            pageId: id,
            slug,
            title,
            parentId,
            sidebarOrder,
            create: true,
            initialBlocks: command.initialBlocks,
          },
          ...(command.navigate === false
            ? []
            : [
                { type: "navigate", slug, userPage: true } satisfies PageEffect,
              ]),
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
    case "page.resetToRemote": {
      return {
        effects: [{ type: "page.resetToRemote", pageId: command.pageId }],
      };
    }
    case "page.resetAllToRemote": {
      return { effects: [{ type: "page.resetAllToRemote" }] };
    }
    case "page.reposition": {
      try {
        const plan = planPageReposition({
          appendPageLinkOnParent: command.appendPageLinkOnParent ?? false,
          insertBeforePageId: command.insertBeforePageId,
          pageId: command.pageId,
          parentId: command.parentId,
          pages,
        });

        return {
          effects: [
            {
              type: "page.reposition",
              plan,
              seed: command.seed,
              parentSeed: command.parentSeed,
              seedsByPageId: command.seedsByPageId,
            },
          ],
        };
      } catch {
        return { effects: [] };
      }
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

function applyPagePersistEffect(
  effect: Extract<PageEffect, { type: "page.persist" }>,
  dispatchPages: PageSummary[],
  now: string
): void {
  const slug = normalizePageSlug(effect.slug);

  if (effect.create) {
    const defaultBlock = createEmptyBlock("text");
    const blocksToSeed: Block[] =
      effect.initialBlocks && effect.initialBlocks.length > 0
        ? effect.initialBlocks
        : [defaultBlock];

    purgeSlugTombstonesForUserPageCreate(slug, effect.parentId ?? null);

    localPagesCollection.insert({
      id: effect.pageId,
      slug,
      title: effect.title,
      parentId: effect.parentId ?? null,
      ...(effect.sidebarOrder === undefined
        ? {}
        : { sidebarOrder: effect.sidebarOrder }),
      serverBaselineHash: null,
      createdAt: now,
      updatedAt: now,
    });
    seedPageBlocks(effect.pageId, blocksToSeed);
    return;
  }

  persistPageMetadata({
    pageId: effect.pageId,
    previousSlug: effect.previousSlug,
    slug: effect.slug,
    title: effect.title,
    pages: dispatchPages,
  });
}

function seedParentPageForReposition(
  effect: Extract<PageEffect, { type: "page.reposition" }>,
  dispatchPages: PageSummary[],
  now: string
): void {
  const parentId = effect.plan.parentPageIdForLink;
  if (!(effect.parentSeed && parentId)) {
    return;
  }

  const parentExists = localPagesCollection.toArray.some(
    (page) => page.id === parentId
  );
  if (parentExists) {
    return;
  }

  const parentSummary = dispatchPages.find((page) => page.id === parentId);
  localPagesCollection.insert({
    id: parentId,
    slug: parentSummary?.slug ?? "/",
    title: parentSummary?.title ?? "",
    parentId: parentSummary?.parentId ?? null,
    icon: parentSummary?.icon,
    serverBaselineHash: effect.parentSeed.serverBaselineHash,
    createdAt: now,
    updatedAt: now,
  });
  seedPageBlocks(parentId, effect.parentSeed.blocks);
}

function applyPageRepositionEffect(
  effect: Extract<PageEffect, { type: "page.reposition" }>,
  dispatchPages: PageSummary[],
  now: string
): void {
  seedParentPageForReposition(effect, dispatchPages, now);

  persistPageReposition({
    plan: effect.plan,
    pages: dispatchPages,
    seed: effect.seed,
    seedsByPageId: effect.seedsByPageId,
  });

  const parentId = effect.plan.parentPageIdForLink;
  if (effect.plan.appendPageLinkOnParent && parentId) {
    appendChildPageLinkFromShard({
      childPageId: effect.plan.pageId,
      parentPageId: parentId,
    });
  }
}

/**
 * Applies `PageCommand` effects to collections and the router (`navigate` uses `userPage` for new user pages).
 * @see docs/reference/page-commands.md
 */
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

      const deleteTargets = new Set<string>();
      for (const effect of effects) {
        if (effect.type === "page.delete") {
          deleteTargets.add(effect.pageId);
        }
      }
      if (deleteTargets.size > 0) {
        deletePageLinkReferences(deleteTargets, dispatchPages).catch(
          () => undefined
        );
      }

      for (const effect of effects) {
        switch (effect.type) {
          case "page.persist":
            applyPagePersistEffect(effect, dispatchPages, now);
            break;
          case "page.delete":
            deleteLocalPage(effect.pageId, dispatchPages);
            break;
          case "page.resetToRemote":
            resetPageToRemote(effect.pageId);
            break;
          case "page.resetAllToRemote":
            resetAllToRemote()
              .then(() => {
                navigate({ replace: true, to: "/" });
              })
              .catch(() => undefined);
            break;
          case "page.reposition":
            applyPageRepositionEffect(effect, dispatchPages, now);
            break;
          case "navigate":
            if (effect.mode === "history") {
              syncPageUrl(effect.slug, { userPage: effect.userPage });
              break;
            }

            navigate({
              ...(effect.userPage
                ? pageNavTargetForUserPage(effect.slug)
                : pageNavTarget(effect.slug)),
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
            const { effects } = pageReducer(command, mergedPages);
            applyEffects(effects, mergedPages);
          });
        return;
      }

      const { effects } = pageReducer(command, mergedPages);
      applyEffects(effects, mergedPages);
    },
    [applyEffects, mergedPages, queryClient]
  );
}
