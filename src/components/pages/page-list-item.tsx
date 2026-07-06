import {
  IconChevronRight,
  IconCopy,
  IconCopyOff,
  IconLayoutGrid,
  IconPencil,
  IconPhoto,
  IconRefresh,
  IconStar,
  IconStarOff,
  IconTrash,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  useDragSource,
  useDragState,
  useDropTarget,
} from "@/components/dnd/use-dnd.ts";
import { DeletePageConfirmDialog } from "@/components/pages/delete-page-confirm-dialog.tsx";
import { PageActivityPanel } from "@/components/pages/page-activity-panel.tsx";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { PageIconPicker } from "@/components/pages/page-icon-picker.tsx";
import {
  PageListDatabaseRows,
  useHostedDatabases,
} from "@/components/pages/page-list-database-rows.tsx";
import { PageListRowDropdown } from "@/components/pages/page-list-row-menu.tsx";
import { PageMenuMoveSubmenu } from "@/components/pages/page-menu-move-submenu.tsx";
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
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
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
import { isActivePage, useActivePageRef } from "@/hooks/use-active-page-ref.ts";
import { useFavoriteActions, useIsFavorite } from "@/hooks/use-favorites.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { usePageReposition } from "@/hooks/use-page-reposition.ts";
import { usePageRowEditing } from "@/hooks/use-page-row-editing.ts";
import { useSavePageAsTemplate } from "@/hooks/use-save-page-as-template.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import type { PageRow } from "@/lib/pages/build-page-tree.ts";
import { duplicatePage } from "@/lib/pages/duplicate-page.ts";
import { canDeletePage } from "@/lib/pages/page-delete.ts";
import { pageListRowPaddingLeft } from "@/lib/pages/page-list-preview-depth.ts";
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
  isFavorite: boolean;
  isNestTarget: boolean;
  menuActionRef: React.RefObject<HTMLButtonElement | null>;
  navTarget: PageNavTarget;
  onChangeIcon: () => void;
  onDelete: () => void;
  onDuplicate: (withContent: boolean) => void;
  onMoveTo: (parentId: string | null) => void;
  onRename: () => void;
  onResetToRemote: () => void;
  onSaveAsTemplate: () => void;
  onToggleExpand: (pageId: string) => void;
  onToggleFavorite: () => void;
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
  isFavorite,
  isNestTarget,
  menuActionRef,
  navTarget,
  onChangeIcon,
  onDelete,
  onDuplicate,
  onMoveTo,
  onRename,
  onResetToRemote,
  onSaveAsTemplate,
  onToggleExpand,
  onToggleFavorite,
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
    "transition-none",
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
            className="swap-reveal pointer-events-none absolute inset-0 flex items-center justify-center rounded-sm text-sidebar-foreground outline-hidden ring-sidebar-ring hover-none:pointer-events-auto hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 group-hover/page-row:pointer-events-auto group-focus-visible/page-row:pointer-events-auto"
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
          "focus-within:[&_[data-page-list-row-content]]:pr-8 hover:[&_[data-page-list-row-content]]:bg-sidebar-accent hover-none:[&_[data-page-list-row-content]]:pr-8 hover:[&_[data-page-list-row-content]]:pr-8 hover:[&_[data-page-list-row-content]]:text-sidebar-accent-foreground has-[[data-sidebar=menu-action][aria-expanded=true]]:[&_[data-page-list-row-content]]:bg-sidebar-accent has-[[data-sidebar=menu-action][aria-expanded=true]]:[&_[data-page-list-row-content]]:pr-8 has-[[data-sidebar=menu-action][aria-expanded=true]]:[&_[data-page-list-row-content]]:text-sidebar-accent-foreground"
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
          isFavorite={isFavorite}
          menuActionRef={menuActionRef}
          onChangeIcon={onChangeIcon}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onMoveTo={onMoveTo}
          onRename={onRename}
          onResetToRemote={onResetToRemote}
          onSaveAsTemplate={onSaveAsTemplate}
          onToggleFavorite={onToggleFavorite}
          pageId={pageId}
          pages={pages}
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
      <PageListDatabaseRows
        depth={depth + 1}
        hostPageId={row.page.id}
        pages={pages}
      />
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
  // Hosted databases count as children so the host page gets an expand
  // chevron even with no child pages (the database row is the only child).
  const hostedDatabases = useHostedDatabases(page.id);
  const hasChildren = row.children.length > 0 || hostedDatabases.length > 0;
  const isExpanded = expandedIds.has(page.id);
  const dispatch = usePageDispatch(pages);
  const reposition = usePageReposition(pages, dispatch);
  const navigate = useNavigate();
  const activePage = useActivePageRef();
  const saveAsTemplate = useSavePageAsTemplate(page);
  const localPage = useLocalPageById(page.id);
  const isFavorite = useIsFavorite(page.id);
  const { toggleFavorite } = useFavoriteActions();
  // The row body (and its context menu) render identically on SSR and client so
  // hydration reconciles in place with no remount. The closed-by-default portal
  // siblings below only mount on the client, keeping their heavy modules out of
  // the server render without disturbing the row DOM.
  const isClient = useIsClient();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const menuActionRef = useRef<HTMLButtonElement>(null);

  const {
    handleTitleChange,
    iconPickerOpen,
    iconPickerSeed,
    isRenaming,
    openChangeIcon,
    previousSlugRef,
    renameInputRef,
    seedRef,
    setIconPickerOpen,
    startRenaming,
    stopRenaming,
    title,
  } = usePageRowEditing({ localPage, page, pages });

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

  // A touch drag-reorder begins with the same press-and-hold that Base UI's
  // context menu treats as a long-press, so dragging a row would otherwise pop
  // its actions drawer open. Keep the menu controlled and refuse to open it
  // while a drag is active (or just settled); page actions stay reachable via
  // the always-visible row "⋯" button on touch.
  const isAnyDragging = useDragState((state) => state.draggingId != null);
  const wasDraggingRef = useRef(false);
  const dragEndedAtRef = useRef(0);

  useEffect(() => {
    if (isAnyDragging) {
      wasDraggingRef.current = true;
      setContextMenuOpen(false);
    } else if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      dragEndedAtRef.current = Date.now();
    }
  }, [isAnyDragging]);

  const handleContextMenuOpenChange = useCallback((next: boolean) => {
    if (
      next &&
      (wasDraggingRef.current || Date.now() - dragEndedAtRef.current < 400)
    ) {
      return;
    }
    setContextMenuOpen(next);
  }, []);

  const handleResetToRemote = useCallback(() => {
    dispatch({ type: "page.resetToRemote", pageId: page.id });
  }, [dispatch, page.id]);

  const handleDuplicate = useCallback(
    (withContent: boolean) => {
      duplicatePage({ dispatch, page, withContent });
    },
    [dispatch, page]
  );

  const handleMoveTo = useCallback(
    (parentId: string | null) => {
      reposition({
        appendPageLinkOnParent: false,
        insertBeforePageId: null,
        pageId: page.id,
        parentId,
      });
    },
    [page.id, reposition]
  );

  const handleToggleFavorite = useCallback(() => {
    toggleFavorite(page.id);
  }, [page.id, toggleFavorite]);

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
      isFavorite={isFavorite}
      isNestTarget={isNestTarget}
      menuActionRef={menuActionRef}
      navTarget={navTarget}
      onChangeIcon={openChangeIcon}
      onDelete={() => setDeleteOpen(true)}
      onDuplicate={handleDuplicate}
      onMoveTo={handleMoveTo}
      onRename={startRenaming}
      onResetToRemote={handleResetToRemote}
      onSaveAsTemplate={saveAsTemplate.request}
      onToggleExpand={onToggleExpand}
      onToggleFavorite={handleToggleFavorite}
      pageId={page.id}
      pages={pages}
      row={row}
      title={page.title}
    />
  );

  const menu = isRenaming ? (
    rowContent
  ) : (
    <ContextMenu
      onOpenChange={handleContextMenuOpenChange}
      open={contextMenuOpen}
    >
      <ContextMenuTrigger className="block w-full">
        {rowContent}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuLabel>Page</ContextMenuLabel>
          <ContextMenuItem onClick={handleToggleFavorite}>
            {isFavorite ? <IconStarOff /> : <IconStar />}
            {isFavorite ? "Remove from favorites" : "Add to favorites"}
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <IconCopy />
              Duplicate page
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem
                onClick={() => {
                  handleDuplicate(true);
                }}
              >
                <IconCopy />
                With content
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => {
                  handleDuplicate(false);
                }}
              >
                <IconCopyOff />
                Without content
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem onClick={startRenaming}>
            <IconPencil />
            Rename
          </ContextMenuItem>
          <ContextMenuItem onClick={openChangeIcon}>
            <IconPhoto />
            Change icon
          </ContextMenuItem>
          <PageMenuMoveSubmenu
            onMoveTo={handleMoveTo}
            pageId={page.id}
            pages={pages}
            variant="context"
          />
          <ContextMenuItem onClick={saveAsTemplate.request}>
            <IconLayoutGrid />
            Save as template
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
        <ContextMenuSeparator />
        <PageActivityPanel pageId={page.id} />
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
        <>
          <Dialog
            onOpenChange={saveAsTemplate.setConfirmOpen}
            open={saveAsTemplate.confirmOpen}
          >
            <DialogContent showCloseButton={false}>
              <DialogHeader>
                <DialogTitle>Replace existing template?</DialogTitle>
                <DialogDescription>
                  A page template already exists. Saving “{page.title}” as the
                  template overwrites its content and settings. This cannot be
                  undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  onClick={() => saveAsTemplate.setConfirmOpen(false)}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button onClick={saveAsTemplate.confirm} type="button">
                  Replace template
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <DeletePageConfirmDialog
            onConfirm={handleDelete}
            onOpenChange={setDeleteOpen}
            open={deleteOpen}
            pageId={page.id}
          />
        </>
      ) : null}
    </>
  );
}
