import {
  IconChevronRight,
  IconCopy,
  IconFile,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { usePageBlocks } from "@/db/queries/use-page-blocks.ts";
import { isActivePage, useActivePageRef } from "@/hooks/use-active-page-ref.ts";
import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { hashPageBlocks } from "@/lib/content/block-hash.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { loadPage } from "@/lib/content/load-page.ts";
import type { PageRow } from "@/lib/pages/build-page-tree.ts";
import { clonePageBlocks } from "@/lib/pages/clone-page-blocks.ts";
import { canDeletePage } from "@/lib/pages/page-delete.ts";
import {
  type PageMetadataSeed,
  persistPageMetadata,
} from "@/lib/pages/persist-page-metadata.ts";
import {
  resolveDeleteRedirectTarget,
  resolvePageNavTarget,
} from "@/lib/pages/resolve-page-nav-target.ts";
import type { PageNavTarget } from "@/lib/pages/slugify.ts";
import type { Block } from "@/lib/schemas/block.ts";
import { cn } from "@/lib/utils.ts";

interface PageListItemProps {
  depth: number;
  expandedIds: Set<string>;
  onToggleExpand: (pageId: string) => void;
  pages: PageSummary[];
  row: PageRow;
}

function resolveSourceBlocks(
  page: PageSummary,
  localBlocks: Block[]
): Promise<Block[]> {
  if (localBlocks.length > 0) {
    return Promise.resolve(localBlocks);
  }

  return loadPage({ data: { slug: page.slug } }).then(
    (loaded) => loaded.blocks
  );
}

function PageListRowLeading({
  hasChildren,
  isExpanded,
  onToggleExpand,
  title,
}: {
  hasChildren: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  title: string;
}) {
  return (
    <span className="relative flex size-7 shrink-0 items-center justify-center">
      <IconFile
        aria-hidden
        className={cn(
          "size-3.5 text-muted-foreground",
          hasChildren &&
            "transition-opacity group-hover/page-list-row:opacity-0"
        )}
      />
      {hasChildren ? (
        <span
          aria-expanded={isExpanded}
          aria-label={isExpanded ? `Collapse ${title}` : `Expand ${title}`}
          className="absolute inset-0 flex items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-muted focus-visible:bg-muted focus-visible:opacity-100 group-hover/page-list-row:opacity-100"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleExpand();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            onToggleExpand();
          }}
          role="button"
          tabIndex={0}
        >
          <IconChevronRight
            className={cn(
              "size-3.5 transition-transform",
              isExpanded && "rotate-90"
            )}
          />
        </span>
      ) : null}
    </span>
  );
}

function PageListRowDelete({
  onDelete,
  title,
}: {
  onDelete: () => void;
  title: string;
}) {
  return (
    <span
      aria-label={`Delete ${title}`}
      className="flex size-7 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-muted focus-visible:bg-muted focus-visible:opacity-100 group-hover/page-list-row:opacity-100"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDelete();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        onDelete();
      }}
      role="button"
      tabIndex={0}
    >
      <IconTrash className="size-3.5 text-muted-foreground" />
    </span>
  );
}

function pageListRowPadding(depth: number): string {
  if (depth <= 0) {
    return "px-2";
  }

  if (depth === 1) {
    return "pr-2 pl-5";
  }

  return "pr-2 pl-8";
}

function PageListRowLink({
  canDelete,
  depth,
  hasChildren,
  navTarget,
  onDelete,
  onToggleExpand,
  title,
  isExpanded,
}: {
  canDelete: boolean;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  navTarget: PageNavTarget;
  onDelete: () => void;
  onToggleExpand: () => void;
  title: string;
}) {
  return (
    <Button
      className={cn(
        "group/page-list-row h-7 w-full justify-start gap-0 font-normal",
        pageListRowPadding(depth)
      )}
      nativeButton={false}
      render={<Link {...navTarget} />}
      size="sm"
      type="button"
      variant="ghost"
    >
      <PageListRowLeading
        hasChildren={hasChildren}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
        title={title}
      />
      <span className="min-w-0 flex-1 truncate text-left">{title}</span>
      {canDelete ? (
        <PageListRowDelete onDelete={onDelete} title={title} />
      ) : null}
    </Button>
  );
}

function PageListRowRename({
  depth,
  onTitleChange,
  onStopRenaming,
  renameInputRef,
  title,
  value,
}: {
  depth: number;
  onStopRenaming: () => void;
  onTitleChange: (nextTitle: string) => void;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  title: string;
  value: string;
}) {
  return (
    <div
      className={cn("flex h-7 w-full items-center", pageListRowPadding(depth))}
    >
      <PageListRowLeading
        hasChildren={false}
        isExpanded={false}
        onToggleExpand={() => undefined}
        title={title}
      />
      <input
        aria-label={`Rename ${title}`}
        className="h-7 min-w-0 flex-1 rounded-lg border-0 bg-transparent px-2 font-normal text-[0.8rem] text-muted-foreground outline-none"
        onBlur={onStopRenaming}
        onChange={(event) => onTitleChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onStopRenaming();
          }

          if (event.key === "Enter") {
            event.preventDefault();
            onStopRenaming();
          }
        }}
        ref={renameInputRef}
        type="text"
        value={value}
      />
    </div>
  );
}

export function PageListItem({
  depth,
  expandedIds,
  onToggleExpand,
  pages,
  row,
}: PageListItemProps) {
  const page = row.page;
  const hasChildren = row.children.length > 0;
  const isExpanded = expandedIds.has(page.id);
  const dispatch = usePageDispatch(pages);
  const navigate = useNavigate();
  const activePage = useActivePageRef();
  const localPage = useLocalPageById(page.id);
  const { blocks: localBlocks } = usePageBlocks(page.id);

  const [isRenaming, setIsRenaming] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [title, setTitle] = useState(page.title);
  const [prevPageTitle, setPrevPageTitle] = useState(page.title);
  const previousSlugRef = useRef(page.slug);
  const seedRef = useRef<PageMetadataSeed | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  if (page.title !== prevPageTitle) {
    setPrevPageTitle(page.title);
    setTitle(page.title);
  }

  const canDelete = canDeletePage(page.id, pages);
  const navTarget = resolvePageNavTarget(page.id, pages);

  const ensureSeed = useCallback(async (): Promise<PageMetadataSeed | null> => {
    if (localPage) {
      return null;
    }

    if (seedRef.current) {
      return seedRef.current;
    }

    const loaded = await loadPage({ data: { slug: page.slug } });
    seedRef.current = {
      blocks: loaded.blocks,
      serverBaselineHash: hashPageBlocks(loaded.blocks),
    };
    return seedRef.current;
  }, [localPage, page.slug]);

  const handleTitleChange = useCallback(
    (nextTitle: string) => {
      setTitle(nextTitle);

      const applyPersist = (seed?: PageMetadataSeed) => {
        const { slug } = persistPageMetadata({
          pageId: page.id,
          previousSlug: previousSlugRef.current,
          title: nextTitle,
          pages,
          seed,
        });
        previousSlugRef.current = slug;
      };

      if (localPage) {
        applyPersist();
        return;
      }

      ensureSeed()
        .then((seed) => {
          if (seed) {
            applyPersist(seed);
          }
        })
        .catch(() => undefined);
    },
    [ensureSeed, localPage, page.id, pages]
  );

  const handleDuplicate = useCallback(() => {
    resolveSourceBlocks(page, localBlocks)
      .then((sourceBlocks) => {
        dispatch({
          type: "page.create",
          title: `Copy of ${page.title}`,
          parentId: page.parentId,
          initialBlocks: clonePageBlocks(sourceBlocks),
        });
      })
      .catch(() => undefined);
  }, [dispatch, localBlocks, page]);

  const handleDelete = useCallback(() => {
    dispatch({ type: "page.delete", pageId: page.id });
    setDeleteOpen(false);

    if (isActivePage(page.id, page.slug, activePage)) {
      navigate({
        ...resolveDeleteRedirectTarget(page.id, pages),
        replace: true,
      });
    }
  }, [activePage, dispatch, navigate, page.id, page.slug, pages]);

  const startRenaming = useCallback(() => {
    setIsRenaming(true);
  }, []);

  useEffect(() => {
    if (!isRenaming) {
      return;
    }

    const input = renameInputRef.current;
    if (!input) {
      return;
    }

    requestAnimationFrame(() => {
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    });
  }, [isRenaming]);

  const stopRenaming = useCallback(() => {
    setIsRenaming(false);
  }, []);

  const rowContent = isRenaming ? (
    <PageListRowRename
      depth={depth}
      onStopRenaming={stopRenaming}
      onTitleChange={handleTitleChange}
      renameInputRef={renameInputRef}
      title={page.title}
      value={title}
    />
  ) : (
    <PageListRowLink
      canDelete={canDelete}
      depth={depth}
      hasChildren={hasChildren}
      isExpanded={isExpanded}
      navTarget={navTarget}
      onDelete={() => setDeleteOpen(true)}
      onToggleExpand={() => onToggleExpand(page.id)}
      title={page.title}
    />
  );

  const menu = isRenaming ? (
    rowContent
  ) : (
    <ContextMenu>
      <ContextMenuTrigger className="block w-full">
        {rowContent}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={handleDuplicate}>
          <IconCopy />
          Duplicate page
        </ContextMenuItem>
        <ContextMenuItem onClick={startRenaming}>
          <IconPencil />
          Rename
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!canDelete}
          onClick={() => setDeleteOpen(true)}
          variant="destructive"
        >
          <IconTrash />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );

  return (
    <>
      <div className="w-full">{menu}</div>

      {hasChildren && isExpanded ? (
        <ul className="space-y-1">
          {row.children.map((childRow) => (
            <li key={childRow.page.id}>
              <PageListItem
                depth={depth + 1}
                expandedIds={expandedIds}
                onToggleExpand={onToggleExpand}
                pages={pages}
                row={childRow}
              />
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete page?</DialogTitle>
            <DialogDescription>
              {localPage && localPage.serverBaselineHash === null
                ? "This page and its blocks will be removed. This cannot be undone."
                : "This page will be hidden locally. The published version will remain."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setDeleteOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={handleDelete} type="button" variant="destructive">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface PageListItemStaticProps {
  depth: number;
  row: PageRow;
}

export function PageListItemStatic({ depth, row }: PageListItemStaticProps) {
  const page = row.page;
  const navTarget = resolvePageNavTarget(page.id, [page]);

  return (
    <div className="w-full">
      <Button
        className={cn(
          "h-7 w-full justify-start gap-0 font-normal",
          pageListRowPadding(depth)
        )}
        nativeButton={false}
        render={<Link {...navTarget} />}
        size="sm"
        type="button"
        variant="ghost"
      >
        <PageListRowLeading
          hasChildren={false}
          isExpanded={false}
          onToggleExpand={() => undefined}
          title={page.title}
        />
        <span className="min-w-0 flex-1 truncate text-left">{page.title}</span>
      </Button>
    </div>
  );
}
