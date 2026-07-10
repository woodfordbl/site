"use client";

import {
  IconDatabase,
  IconPencil,
  IconPhoto,
  IconTrash,
} from "@tabler/icons-react";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { DatabaseSidebarRowMenu } from "@/components/pages/database-sidebar-row-menu.tsx";
import { DeleteDatabaseConfirmDialog } from "@/components/pages/delete-database-confirm-dialog.tsx";
import { GlyphIconPicker } from "@/components/pages/glyph-icon-picker.tsx";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { iconSlotClassName } from "@/components/ui/button.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.tsx";
import {
  deleteDatabase,
  renameDatabase,
  setDatabaseIcon,
} from "@/db/queries/database-collection-ops.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";
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

function DatabaseSidebarRowRename({
  database,
  depth,
  draftName,
  onDraftNameChange,
  onStopRenaming,
  renameInputRef,
}: {
  database: DatabaseSidebarRowEntry;
  depth: number;
  draftName: string;
  onDraftNameChange: (nextName: string) => void;
  onStopRenaming: () => void;
  renameInputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <SidebarMenuItem>
      <div
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-md p-2",
          pageListRowPaddingLeft(depth)
        )}
      >
        <DatabaseSidebarRowIcon icon={database.icon} />
        <input
          aria-label={`Rename ${database.name}`}
          className="min-h-0 min-w-0 flex-1 border-0 bg-transparent p-0 font-normal text-sidebar-foreground text-sm outline-none"
          onBlur={onStopRenaming}
          onChange={(event) => {
            onDraftNameChange(event.target.value);
          }}
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
          value={draftName}
        />
      </div>
    </SidebarMenuItem>
  );
}

/**
 * Shared sidebar row for a workspace database. Used by the workspace
 * **Databases** section and hosted-database child rows under pages. Click
 * opens `/db/$databaseId`; right-click and the row ⋯ menu share Rename,
 * Change icon, and Delete.
 */
export function DatabaseSidebarRow({
  database,
  depth = 0,
}: DatabaseSidebarRowProps): ReactNode {
  const navigate = useNavigate();
  const routeParams = useParams({ strict: false });
  const isClient = useIsClient();
  const active = routeParams.databaseId === database.id;

  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(database.name);
  const [prevPersistedName, setPrevPersistedName] = useState(database.name);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const menuActionRef = useRef<HTMLButtonElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const isRenamingRef = useRef(false);

  if (!isRenamingRef.current && database.name !== prevPersistedName) {
    setPrevPersistedName(database.name);
    setDraftName(database.name);
  }

  useEffect(() => {
    if (!isRenaming) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [isRenaming]);

  const commitRename = useCallback(() => {
    const trimmed = draftName.trim();
    if (trimmed !== "" && trimmed !== database.name) {
      renameDatabase(database.id, trimmed);
    } else {
      setDraftName(database.name);
    }
  }, [database.id, database.name, draftName]);

  const startRenaming = useCallback(() => {
    isRenamingRef.current = true;
    setDraftName(database.name);
    setIsRenaming(true);
  }, [database.name]);

  const stopRenaming = useCallback(() => {
    isRenamingRef.current = false;
    commitRename();
    setIsRenaming(false);
  }, [commitRename]);

  const openChangeIcon = useCallback(() => {
    setIconPickerOpen(true);
  }, []);

  const handleDelete = useCallback(() => {
    deleteDatabase(database.id);
    setDeleteOpen(false);

    if (routeParams.databaseId === database.id) {
      navigate({ to: "/" });
    }
  }, [database.id, navigate, routeParams.databaseId]);

  const navigateToDatabase = useCallback(() => {
    navigate({
      params: { databaseId: database.id },
      to: "/db/$databaseId",
    });
    (document.activeElement as HTMLElement | null)?.blur();
  }, [database.id, navigate]);

  if (isRenaming) {
    return (
      <DatabaseSidebarRowRename
        database={database}
        depth={depth}
        draftName={draftName}
        onDraftNameChange={setDraftName}
        onStopRenaming={stopRenaming}
        renameInputRef={renameInputRef}
      />
    );
  }

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
        menuActionRef={menuActionRef}
        onChangeIcon={openChangeIcon}
        onDelete={() => {
          setDeleteOpen(true);
        }}
        onRename={startRenaming}
        title={database.name}
      />
    </div>
  );

  return (
    <>
      <SidebarMenuItem>
        <ContextMenu onOpenChange={setContextMenuOpen} open={contextMenuOpen}>
          <ContextMenuTrigger className="block w-full">
            {rowBody}
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuGroup>
              <ContextMenuLabel>Database</ContextMenuLabel>
              <ContextMenuItem onClick={startRenaming}>
                <IconPencil />
                Rename
              </ContextMenuItem>
              <ContextMenuItem onClick={openChangeIcon}>
                <IconPhoto />
                Change icon
              </ContextMenuItem>
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
        <GlyphIconPicker
          anchor={menuActionRef}
          ariaLabel="Change database icon"
          contentAlign="start"
          contentSide="right"
          hideTrigger
          icon={database.icon}
          onOpenChange={setIconPickerOpen}
          onRemove={() => {
            setDatabaseIcon(database.id, undefined);
          }}
          onSelect={(icon) => {
            setDatabaseIcon(database.id, icon);
          }}
          open={iconPickerOpen}
        />
      ) : null}

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
