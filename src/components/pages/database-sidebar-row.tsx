"use client";

import { IconDatabase, IconTrash } from "@tabler/icons-react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback, useRef, useState } from "react";

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
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import {
  MenuIconRenameInput,
  shouldCancelMenuCloseForIconPicker,
} from "@/components/ui/menu-icon-rename-input.tsx";
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.tsx";
import { localBlocksCollection } from "@/db/collections/local-collections.ts";
import {
  deleteDatabase,
  renameDatabase,
  setDatabaseIcon,
} from "@/db/queries/database-collection-ops.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { useLocalDatabasesSnapshot } from "@/hooks/use-local-databases.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { databaseHubNavTarget } from "@/lib/databases/database-page-paths.ts";
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
}

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
 * icon (InputGroup) and Delete.
 */
export function DatabaseSidebarRow({
  database,
  depth = 0,
}: DatabaseSidebarRowProps): ReactNode {
  const navigate = useNavigate();
  const location = useLocation();
  const isClient = useIsClient();
  const databases = useLocalDatabasesSnapshot();
  const { pages } = useMergedPageListItems();
  const currentDatabase = databases.find((entry) => entry.id === database.id);
  const navTarget = currentDatabase
    ? databaseHubNavTarget(
        currentDatabase,
        pages,
        localBlocksCollection.toArray
      )
    : null;
  const active =
    navTarget !== null &&
    (location.pathname === navTarget.to ||
      location.pathname.startsWith(`${navTarget.to}/`));

  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [draftName, setDraftName] = useState(database.name);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const menuActionRef = useRef<HTMLButtonElement>(null);

  const commitRename = useCallback(() => {
    const trimmed = draftName.trim();
    if (trimmed !== "" && trimmed !== database.name) {
      renameDatabase(database.id, trimmed);
    } else {
      setDraftName(database.name);
    }
  }, [database.id, database.name, draftName]);

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
    deleteDatabase(database.id);
    setDeleteOpen(false);

    if (active) {
      navigate({ to: "/" });
    }
  }, [active, database.id, navigate]);

  const navigateToDatabase = useCallback(() => {
    if (navTarget) {
      navigate(navTarget);
    }
    (document.activeElement as HTMLElement | null)?.blur();
  }, [navigate, navTarget]);

  const writeIcon = useCallback(
    (icon: string | undefined) => {
      setDatabaseIcon(database.id, icon);
    },
    [database.id]
  );

  const rowBody = (
    <div
      className={cn(
        "group/database-row relative w-full",
        "focus-within:[&_[data-database-sidebar-row-content]]:pr-8 hover:[&_[data-database-sidebar-row-content]]:bg-sidebar-accent hover-none:[&_[data-database-sidebar-row-content]]:pr-8 hover:[&_[data-database-sidebar-row-content]]:pr-8 hover:[&_[data-database-sidebar-row-content]]:text-sidebar-accent-foreground has-[[data-sidebar=menu-action][aria-expanded=true]]:[&_[data-database-sidebar-row-content]]:bg-sidebar-accent has-[[data-sidebar=menu-action][aria-expanded=true]]:[&_[data-database-sidebar-row-content]]:pr-8 has-[[data-sidebar=menu-action][aria-expanded=true]]:[&_[data-database-sidebar-row-content]]:text-sidebar-accent-foreground"
      )}
      data-reveal-group=""
    >
      <SidebarMenuButton
        className={pageListRowPaddingLeft(depth)}
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
      <DatabaseSidebarRowMenu
        databaseId={database.id}
        icon={database.icon}
        menuActionRef={menuActionRef}
        name={database.name}
        onDelete={() => {
          setDeleteOpen(true);
        }}
      />
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
          <ContextMenuContent className="w-64 min-w-64">
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
                onClick={() => {
                  setDeleteOpen(true);
                }}
                variant="destructive"
              >
                <IconTrash />
                Delete
              </ContextMenuItem>
            </ContextMenuGroup>
          </ContextMenuContent>
        </ContextMenu>
      </SidebarMenuItem>

      {isClient ? (
        <DeleteDatabaseConfirmDialog
          databaseName={database.name}
          onConfirm={handleDelete}
          onOpenChange={setDeleteOpen}
          open={deleteOpen}
        />
      ) : null}
    </>
  );
}
