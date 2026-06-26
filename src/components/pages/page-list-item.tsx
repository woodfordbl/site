import {
  IconChevronRight,
  IconCopy,
  IconPencil,
  IconPhoto,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { useDragSource, useDropTarget } from "@/components/dnd/use-dnd.ts";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { PageIconPicker } from "@/components/pages/page-icon-picker.tsx";
import { PageListRowDropdown } from "@/components/pages/page-list-row-menu.tsx";
import { Button, iconSlotClassName } from "@/components/ui/button.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
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
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar.tsx";
import { readBootstrapPageBlocks } from "@/db/queries/read-bootstrap-page-blocks.ts";
import { isActivePage, useActivePageRef } from "@/hooks/use-active-page-ref.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { hashPageBlocks } from "@/lib/content/block-hash.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { loadPage } from "@/lib/content/load-page.ts";
import type { PageRow } from "@/lib/pages/build-page-tree.ts";
import { clonePageBlocks } from "@/lib/pages/clone-page-blocks.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";
import { canDeletePage } from "@/lib/pages/page-delete.ts";
import { pageListRowPaddingLeft } from "@/lib/pages/page-list-preview-depth.ts";
import {
  type PageMetadataSeed,
  persistPageMetadata,
} from "@/lib/pages/persist-page-metadata.ts";
import type { PageListDropTarget } from "@/lib/pages/resolve-page-list-drop-target.ts";
import {
  resolveDeleteRedirectTarget,
  resolvePageNavTarget,
} from "@/lib/pages/resolve-page-nav-target.ts";
import type { PageNavTarget } from "@/lib/pages/slugify.ts";
import { isLocallyDeletedPage } from "@/lib/schemas/local-page.ts";
import { cn } from "@/lib/utils.ts";

interface PageListItemProps {
  depth: number;
  expandedIds: Set<string>;
  onToggleExpand: (pageId: string) => void;
  pages: PageSummary[];
  row: PageRow;
}

import { resolveSourceBlocksForPage } from "@/lib/pages/resolve-source-page-blocks.ts";

const PAGE_LIST_DRAG_HOLD_MS = 50;

function PageListRowDropIndicators({
  dropIndicator,
}: {
  dropIndicator: "before" | "after" | null;
}) {
  return (
    <>
      {dropIndicator === "before" ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-1 -translate-y-1/2 rounded-full bg-selection-primary"
        />
      ) : null}
      {dropIndicator === "after" ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-1 translate-y-1/2 rounded-full bg-selection-primary"
        />
      ) : null}
    </>
  );
}

interface PageListRowLinkProps {
  active: boolean;
  canDelete: boolean;
  canResetToRemote: boolean;
  depth: number;
  dropIndicator: "before" | "after" | null;
  expandedIds: Set<string>;
  hasChildren: boolean;
  icon?: string;
  isExpanded: boolean;
  isNestTarget: boolean;
  menuActionRef: React.RefObject<HTMLButtonElement | null>;
  navTarget: PageNavTarget;
  onChangeIcon: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onResetToRemote: () => void;
  onToggleExpand: (pageId: string) => void;
  pageId: string;
  pages: PageSummary[];
  row: PageRow;
  title: string;
}

function PageListRowLink({
  active,
  canDelete,
  canResetToRemote,
  depth,
  dropIndicator,
  expandedIds,
  hasChildren,
  icon,
  isExpanded,
  isNestTarget,
  menuActionRef,
  navTarget,
  onChangeIcon,
  onDelete,
  onDuplicate,
  onRename,
  onResetToRemote,
  onToggleExpand,
  pageId,
  pages,
  row,
  title,
}: PageListRowLinkProps) {
  const navigate = useNavigate();
  const { getSourceProps, isDragging, showGrabbing, shouldSuppressClick } =
    useDragSource({ id: pageId, holdMs: PAGE_LIST_DRAG_HOLD_MS });

  const navigateToPage = () => {
    if (shouldSuppressClick()) {
      return;
    }
    navigate(navTarget);
    // Mouse clicks focus the row span; blur so hover-only chrome does not stick.
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const menuButtonClassName = cn(
    pageListRowPaddingLeft(depth),
    isNestTarget && "bg-selection-primary",
    isDragging &&
      "text-muted-foreground hover:bg-transparent hover:text-muted-foreground"
  );

  const menuButtonRender = (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: custom render span for SidebarMenuButton navigation
    // biome-ignore lint/a11y/noStaticElementInteractions: custom render span for SidebarMenuButton navigation
    <span
      className="flex w-full min-w-0 select-none items-center gap-2"
      onClick={navigateToPage}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        event.preventDefault();
        navigateToPage();
      }}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard navigation for page row link surface
      tabIndex={0}
    />
  );

  const showExpandChevron = hasChildren && !isDragging;

  const menuButtonChildren = (
    <>
      <span className={iconSlotClassName("icon-xs", "relative size-4")}>
        <PageIconDisplay
          className={cn(
            showExpandChevron &&
              "swap-conceal absolute inset-0 flex items-center justify-center group-hover/page-row:pointer-events-none group-focus-visible/page-row:pointer-events-none"
          )}
          icon={icon}
        />
        {showExpandChevron ? (
          <CollapsibleTrigger
            aria-expanded={isExpanded}
            aria-label={isExpanded ? `Collapse ${title}` : `Expand ${title}`}
            className="swap-reveal pointer-events-none absolute inset-0 flex items-center justify-center rounded-sm text-sidebar-foreground outline-hidden ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 group-hover/page-row:pointer-events-auto group-focus-visible/page-row:pointer-events-auto"
            onClick={(event) => {
              event.stopPropagation();
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
          >
            <IconChevronRight
              className={cn(
                "size-3.5 transition-transform duration-100 ease-out",
                isExpanded && "rotate-90"
              )}
            />
          </CollapsibleTrigger>
        ) : null}
      </span>
      <span className="min-w-0 flex-1 truncate text-left">{title}</span>
    </>
  );

  const rowBody = (
    <div
      className={cn(
        "group/page-row relative w-full [&_*]:[-webkit-user-drag:none]",
        showGrabbing && "cursor-grabbing",
        isDragging && "text-muted-foreground",
        !isDragging &&
          "hover:[&_[data-page-list-row-content]]:bg-sidebar-accent hover:[&_[data-page-list-row-content]]:text-sidebar-accent-foreground has-[[data-sidebar=menu-action][aria-expanded=true]]:[&_[data-page-list-row-content]]:bg-sidebar-accent has-[[data-sidebar=menu-action][aria-expanded=true]]:[&_[data-page-list-row-content]]:text-sidebar-accent-foreground"
      )}
      data-page-list-row-id={pageId}
      data-reveal-group=""
      {...getSourceProps()}
    >
      <PageListRowDropIndicators dropIndicator={dropIndicator} />
      <SidebarMenuButton
        className={menuButtonClassName}
        data-page-list-row-content=""
        isActive={active}
        render={menuButtonRender}
        tooltip={depth === 0 ? title : undefined}
      >
        {menuButtonChildren}
      </SidebarMenuButton>
      {isDragging ? null : (
        <PageListRowDropdown
          canDelete={canDelete}
          canResetToRemote={canResetToRemote}
          menuActionRef={menuActionRef}
          onChangeIcon={onChangeIcon}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onRename={onRename}
          onResetToRemote={onResetToRemote}
          title={title}
        />
      )}
    </div>
  );

  if (!hasChildren) {
    return <SidebarMenuItem>{rowBody}</SidebarMenuItem>;
  }

  return (
    <Collapsible
      className="group/collapsible"
      onOpenChange={(open) => {
        if (open !== isExpanded) {
          onToggleExpand(pageId);
        }
      }}
      open={isExpanded}
    >
      <SidebarMenuItem>
        {rowBody}
        <CollapsibleContent className="pt-px">
          <PageListChildren
            depth={depth}
            expandedIds={expandedIds}
            onToggleExpand={onToggleExpand}
            pages={pages}
            row={row}
          />
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function PageListChildren({
  depth,
  expandedIds,
  onToggleExpand,
  pages,
  row,
}: {
  depth: number;
  expandedIds: Set<string>;
  onToggleExpand: (pageId: string) => void;
  pages: PageSummary[];
  row: PageRow;
}) {
  return (
    <SidebarMenuSub className="mx-0 w-full translate-x-0 gap-y-px border-0 px-0 py-0">
      {row.children.map((childRow) => (
        <PageListItem
          depth={depth + 1}
          expandedIds={expandedIds}
          key={childRow.page.id}
          onToggleExpand={onToggleExpand}
          pages={pages}
          row={childRow}
        />
      ))}
    </SidebarMenuSub>
  );
}

function PageListRowIconSlot({
  className,
  icon,
}: {
  className?: string;
  icon?: string;
}) {
  return (
    <span
      className={cn(iconSlotClassName("icon-xs", "relative size-4"), className)}
    >
      <PageIconDisplay icon={icon} />
    </span>
  );
}

function PageListRowRename({
  depth,
  icon,
  onTitleChange,
  onStopRenaming,
  renameInputRef,
  title,
  value,
}: {
  depth: number;
  icon?: string;
  onStopRenaming: () => void;
  onTitleChange: (nextTitle: string) => void;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  title: string;
  value: string;
}) {
  return (
    <SidebarMenuItem>
      <div
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-md p-2",
          pageListRowPaddingLeft(depth)
        )}
      >
        <PageListRowIconSlot icon={icon} />
        <input
          aria-label={`Rename ${title}`}
          className="min-h-0 min-w-0 flex-1 border-0 bg-transparent p-0 font-normal text-sidebar-foreground text-sm outline-none"
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
    </SidebarMenuItem>
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
  // The row body (and its context menu) render identically on SSR and client so
  // hydration reconciles in place with no remount. The closed-by-default portal
  // siblings below only mount on the client, keeping their heavy modules out of
  // the server render without disturbing the row DOM.
  const isClient = useIsClient();

  const [isRenaming, setIsRenaming] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconPickerSeed, setIconPickerSeed] = useState<
    PageMetadataSeed | undefined
  >();
  const persistedTitle = localPage?.title ?? page.title;
  const persistedSlug = localPage?.slug ?? page.slug;

  const [title, setTitle] = useState(persistedTitle);
  const [prevPersistedTitle, setPrevPersistedTitle] = useState(persistedTitle);
  const [prevPersistedSlug, setPrevPersistedSlug] = useState(persistedSlug);
  const previousSlugRef = useRef(persistedSlug);
  const isRenamingRef = useRef(false);
  const seedRef = useRef<PageMetadataSeed | null>(null);
  const menuActionRef = useRef<HTMLButtonElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  if (!isRenamingRef.current && persistedTitle !== prevPersistedTitle) {
    setPrevPersistedTitle(persistedTitle);
    setTitle(persistedTitle);
  }

  if (persistedSlug !== prevPersistedSlug) {
    setPrevPersistedSlug(persistedSlug);
    previousSlugRef.current = persistedSlug;
  }

  const canDeleteRow = canDeletePage(page.id, pages);
  const canResetToRemote =
    localPage != null &&
    localPage.serverBaselineHash != null &&
    !isLocallyDeletedPage(localPage);
  const navTarget = resolvePageNavTarget(page.id, pages);
  const active = isActivePage(page.id, page.slug, activePage);

  const dropIndicator = useDropTarget((target: PageListDropTarget | null) =>
    target?.kind === "sibling" && target.anchorPageId === page.id
      ? target.edge
      : null
  );
  const isNestTarget = useDropTarget(
    (target: PageListDropTarget | null) =>
      target?.kind === "nest" && target.parentPageId === page.id
  );

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

      if (nextTitle.trim() === "") {
        return;
      }

      const applyPersist = (seed?: PageMetadataSeed) => {
        persistPageMetadata({
          pageId: page.id,
          slug: previousSlugRef.current,
          previousSlug: previousSlugRef.current,
          title: nextTitle,
          pages,
          seed,
        });
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

  const handleResetToRemote = useCallback(() => {
    dispatch({ type: "page.resetToRemote", pageId: page.id });
  }, [dispatch, page.id]);

  const handleDuplicate = useCallback(() => {
    // Read local blocks lazily (non-reactively) so the sidebar row stays
    // SSR-safe — a live query here would abort server rendering.
    const localBlocks = readBootstrapPageBlocks(page.id).blocks;
    resolveSourceBlocksForPage(page, localBlocks)
      .then((sourceBlocks) => {
        dispatch({
          type: "page.create",
          title: `Copy of ${page.title}`,
          parentId: page.parentId,
          initialBlocks: clonePageBlocks(sourceBlocks),
        });
      })
      .catch(() => undefined);
  }, [dispatch, page]);

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
    isRenamingRef.current = true;
    setIsRenaming(true);
  }, []);

  const openChangeIcon = useCallback(() => {
    const openPicker = (seed?: PageMetadataSeed) => {
      if (seed) {
        setIconPickerSeed(seed);
      }
      setIconPickerOpen(true);
    };

    if (localPage) {
      openPicker();
      return;
    }

    ensureSeed()
      .then((seed) => {
        openPicker(seed ?? undefined);
      })
      .catch(() => openPicker());
  }, [ensureSeed, localPage]);

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
    isRenamingRef.current = false;
    setIsRenaming(false);

    const resolvedTitle = title.trim() === "" ? DEFAULT_PAGE_TITLE : title;

    if (title.trim() === "") {
      setTitle(DEFAULT_PAGE_TITLE);
    }

    const applyPersist = (seed?: PageMetadataSeed) => {
      const { slug } = persistPageMetadata({
        pageId: page.id,
        previousSlug: previousSlugRef.current,
        title: resolvedTitle,
        pages,
        seed,
        syncUrl: true,
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
  }, [ensureSeed, localPage, page.id, pages, title]);

  const rowContent = isRenaming ? (
    <PageListRowRename
      depth={depth}
      icon={page.icon}
      onStopRenaming={stopRenaming}
      onTitleChange={handleTitleChange}
      renameInputRef={renameInputRef}
      title={page.title}
      value={title}
    />
  ) : (
    <PageListRowLink
      active={active}
      canDelete={canDeleteRow}
      canResetToRemote={canResetToRemote}
      depth={depth}
      dropIndicator={dropIndicator}
      expandedIds={expandedIds}
      hasChildren={hasChildren}
      icon={page.icon}
      isExpanded={isExpanded}
      isNestTarget={isNestTarget}
      menuActionRef={menuActionRef}
      navTarget={navTarget}
      onChangeIcon={openChangeIcon}
      onDelete={() => setDeleteOpen(true)}
      onDuplicate={handleDuplicate}
      onRename={startRenaming}
      onResetToRemote={handleResetToRemote}
      onToggleExpand={onToggleExpand}
      pageId={page.id}
      pages={pages}
      row={row}
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
        <ContextMenuGroup>
          <ContextMenuLabel>Page</ContextMenuLabel>
          <ContextMenuItem onClick={handleDuplicate}>
            <IconCopy />
            Duplicate page
          </ContextMenuItem>
          <ContextMenuItem onClick={startRenaming}>
            <IconPencil />
            Rename
          </ContextMenuItem>
          <ContextMenuItem onClick={openChangeIcon}>
            <IconPhoto />
            Change icon
          </ContextMenuItem>
          {canResetToRemote ? (
            <ContextMenuItem onClick={handleResetToRemote}>
              <IconRefresh />
              Reset to site version
            </ContextMenuItem>
          ) : null}
          <ContextMenuItem
            disabled={!canDeleteRow}
            onClick={() => setDeleteOpen(true)}
            variant="destructive"
          >
            <IconTrash />
            Delete
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );

  const iconPickerTitle = title.trim() === "" ? page.title : title;

  return (
    <>
      {menu}

      {isClient && !isRenaming ? (
        <PageIconPicker
          anchor={menuActionRef}
          contentAlign="start"
          contentSide="right"
          hideTrigger
          icon={page.icon}
          onOpenChange={setIconPickerOpen}
          open={iconPickerOpen}
          pageId={page.id}
          pages={pages}
          previousSlug={previousSlugRef.current}
          seed={
            localPage
              ? undefined
              : (iconPickerSeed ?? seedRef.current ?? undefined)
          }
          title={iconPickerTitle}
        />
      ) : null}

      {isClient ? (
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
              <Button
                onClick={handleDelete}
                type="button"
                variant="destructive"
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
