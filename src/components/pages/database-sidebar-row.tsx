"use client";

import { IconDatabase, IconTrash } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import {
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

import { DndContext } from "@/components/dnd/dnd-surface.tsx";
import { useDragSource } from "@/components/dnd/use-dnd.ts";
import { useMenuCommandKeys } from "@/components/keyboard/use-menu-command-keys.ts";
import { DatabaseSidebarRowMenu } from "@/components/pages/database-sidebar-row-menu.tsx";
import { DeleteDatabaseConfirmDialog } from "@/components/pages/delete-database-confirm-dialog.tsx";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { iconSlotClassName } from "@/components/ui/button.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import {
  MenuIconRenameInput,
  shouldCancelMenuCloseForIconPicker,
} from "@/components/ui/menu-icon-rename-input.tsx";
import { Shortcut } from "@/components/ui/shortcut.tsx";
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.tsx";
import { localBlocksCollection } from "@/db/collections/local-collections.ts";
import { setDatabaseIcon } from "@/db/queries/database-collection-ops.ts";
import { renameDatabase } from "@/db/queries/database-page-ops.ts";
import {
  isActiveOrDescendantSlug,
  useActivePageRef,
} from "@/hooks/use-active-page-ref.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { useLocalDatabasesSnapshot } from "@/hooks/use-local-databases.ts";
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { databaseListDragSourceId } from "@/lib/databases/database-list-drag.ts";
import {
  databaseHubNavTarget,
  resolveDatabaseHubSlug,
} from "@/lib/databases/database-page-paths.ts";
import { deleteDatabasesEverywhere } from "@/lib/databases/delete-database-everywhere.ts";
import { navigateAfterDatabaseHubRename } from "@/lib/databases/navigate-after-database-rename.ts";
import { pageListRowPaddingLeft } from "@/lib/pages/page-list-preview-depth.ts";
import { cn } from "@/lib/utils.ts";

export interface DatabaseSidebarRowEntry {
  icon?: string;
  id: string;
  name: string;
}

interface DatabaseSidebarRowProps {
  database: DatabaseSidebarRowEntry;
  depth?: number;
  /** When true (hosted page-list rows), enable nest-under-page drag. */
  draggable?: boolean;
}

const DATABASE_LIST_DRAG_HOLD_MS = 50;

function DatabaseSidebarRowIcon({ icon }: { icon?: string }): ReactNode {
  return (
    <span className={iconSlotClassName("icon-xs", "relative size-4")}>
      {icon ? (
        <PageIconDisplay icon={icon} />
      ) : (
        <IconDatabase className="size-4 stroke-[1.5px]" />
      )}
    </span>
  );
}

/**
 * Shared sidebar row for a workspace database. Used by the workspace
 * **Databases** section and hosted-database child rows under pages. Click
 * opens its host-page slug path; right-click and the row ⋯ menu share rename +
 * icon (InputGroup) and Delete. Hosted rows inside the page-list
 * {@link DndSurface} can be drag-nested under another page to rehost.
 */
export function DatabaseSidebarRow({
  database,
  depth = 0,
  draggable = false,
}: DatabaseSidebarRowProps): ReactNode {
  const navigate = useNavigate();
  const activePage = useActivePageRef();
  const isClient = useIsClient();
  const databases = useLocalDatabasesSnapshot();
  const { pages } = useMergedPageListItems();
  const dispatchPage = usePageDispatch(pages);
  const dndContext = useContext(DndContext);
  const canDrag = draggable && dndContext != null;
  const dragSourceId = databaseListDragSourceId(database.id);
  const { getSourceProps, isDragging, showGrabbing, shouldSuppressClick } =
    useDragSource({
      id: dragSourceId,
      holdMs: canDrag ? DATABASE_LIST_DRAG_HOLD_MS : undefined,
    });
  const currentDatabase = databases.find((entry) => entry.id === database.id);
  const blocks = localBlocksCollection.toArray;
  const navTarget = currentDatabase
    ? databaseHubNavTarget(currentDatabase, pages, blocks)
    : null;
  const hubSlug = currentDatabase
    ? resolveDatabaseHubSlug(currentDatabase, pages, blocks)
    : null;
  const active =
    hubSlug !== null && isActiveOrDescendantSlug(hubSlug, activePage);

  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [draftName, setDraftName] = useState(database.name);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const menuActionRef = useRef<HTMLButtonElement>(null);

  const commitRename = useCallback(() => {
    const trimmed = draftName.trim();
    if (trimmed !== "" && trimmed !== database.name) {
      const change = renameDatabase(database.id, trimmed);
      navigateAfterDatabaseHubRename(navigate, change);
    } else {
      setDraftName(database.name);
    }
  }, [database.id, database.name, draftName, navigate]);

  const handleContextMenuOpenChange = useCallback(
    (
      nextOpen: boolean,
      eventDetails?: {
        cancel: () => void;
        event: Event;
        reason: string;
      }
    ) => {
      if (
        shouldCancelMenuCloseForIconPicker(
          nextOpen,
          iconPickerOpen,
          eventDetails
        )
      ) {
        return;
      }

      if (nextOpen) {
        setDraftName(database.name);
        setIconPickerOpen(false);
      } else {
        commitRename();
        setIconPickerOpen(false);
      }
      setContextMenuOpen(nextOpen);
    },
    [commitRename, database.name, iconPickerOpen]
  );

  const handleDelete = useCallback(() => {
    deleteDatabasesEverywhere({
      databaseIds: [database.id],
      dispatchPage,
      pages,
    });
    setDeleteOpen(false);

    if (active) {
      navigate({ to: "/" });
    }
  }, [active, database.id, dispatchPage, navigate, pages]);

  const navigateToDatabase = useCallback(() => {
    if (shouldSuppressClick()) {
      return;
    }
    if (navTarget) {
      navigate(navTarget);
    }
    (document.activeElement as HTMLElement | null)?.blur();
  }, [navigate, navTarget, shouldSuppressClick]);

  const writeIcon = useCallback(
    (icon: string | undefined) => {
      setDatabaseIcon(database.id, icon);
    },
    [database.id]
  );

  const openDeleteConfirm = useCallback(() => {
    setDeleteOpen(true);
  }, []);

  // D (delete-page) is live only while the right-click menu is open.
  const onMenuKeyDown = useMenuCommandKeys({
    "delete-page": openDeleteConfirm,
  });

  const rowBody = (
    <div
      className={cn(
        "group/database-row relative w-full [&_*]:[-webkit-user-drag:none]",
        showGrabbing && "cursor-grabbing",
        isDragging && "text-muted-foreground",
        !isDragging &&
          "focus-within:[&_[data-database-sidebar-row-content]]:pr-8 hover:[&_[data-database-sidebar-row-content]]:bg-sidebar-accent hover-none:[&_[data-database-sidebar-row-content]]:pr-8 hover:[&_[data-database-sidebar-row-content]]:pr-8 hover:[&_[data-database-sidebar-row-content]]:text-sidebar-accent-foreground has-[[data-sidebar=menu-action][aria-expanded=true]]:[&_[data-database-sidebar-row-content]]:bg-sidebar-accent has-[[data-sidebar=menu-action][aria-expanded=true]]:[&_[data-database-sidebar-row-content]]:pr-8 has-[[data-sidebar=menu-action][aria-expanded=true]]:[&_[data-database-sidebar-row-content]]:text-sidebar-accent-foreground"
      )}
      data-database-sidebar-depth={depth}
      data-database-sidebar-row-id={database.id}
      data-reveal-group=""
      {...(canDrag ? getSourceProps() : {})}
    >
      <SidebarMenuButton
        className={cn(
          pageListRowPaddingLeft(depth),
          isDragging &&
            "text-muted-foreground hover:bg-transparent hover:text-muted-foreground"
        )}
        data-database-sidebar-row-content=""
        isActive={active}
        onClick={navigateToDatabase}
        tooltip={depth === 0 ? database.name : undefined}
      >
        <DatabaseSidebarRowIcon icon={database.icon} />
        <span className="min-w-0 flex-1 truncate text-left">
          {database.name}
        </span>
      </SidebarMenuButton>
      {isDragging ? null : (
        <DatabaseSidebarRowMenu
          databaseId={database.id}
          icon={database.icon}
          menuActionRef={menuActionRef}
          name={database.name}
          onDelete={openDeleteConfirm}
        />
      )}
    </div>
  );

  return (
    <>
      <SidebarMenuItem>
        <ContextMenu
          onOpenChange={handleContextMenuOpenChange}
          open={contextMenuOpen}
        >
          <ContextMenuTrigger className="block w-full">
            {rowBody}
          </ContextMenuTrigger>
          <ContextMenuContent
            className="w-64 min-w-64"
            onKeyDownCapture={onMenuKeyDown}
          >
            <MenuIconRenameInput
              ariaLabelIcon="Change database icon"
              ariaLabelName="Database name"
              draftName={draftName}
              fallbackIcon={<IconDatabase className="size-4 stroke-[1.5px]" />}
              icon={database.icon}
              iconPickerOpen={iconPickerOpen}
              onCommit={commitRename}
              onDraftNameChange={setDraftName}
              onIconPickerOpenChange={setIconPickerOpen}
              onIconRemove={() => {
                writeIcon(undefined);
              }}
              onIconSelect={writeIcon}
              onSubmit={() => {
                commitRename();
                setContextMenuOpen(false);
              }}
              placeholder="Database name"
            />
            <ContextMenuSeparator />
            <ContextMenuGroup>
              <ContextMenuLabel>Database</ContextMenuLabel>
              <ContextMenuItem
                onClick={openDeleteConfirm}
                variant="destructive"
              >
                <IconTrash />
                Delete
                <ContextMenuShortcut>
                  <Shortcut command="delete-page" />
                </ContextMenuShortcut>
              </ContextMenuItem>
            </ContextMenuGroup>
          </ContextMenuContent>
        </ContextMenu>
      </SidebarMenuItem>

      {isClient ? (
        <DeleteDatabaseConfirmDialog
          databaseNames={[database.name]}
          onConfirm={handleDelete}
          onOpenChange={setDeleteOpen}
          open={deleteOpen}
        />
      ) : null}
    </>
  );
}
