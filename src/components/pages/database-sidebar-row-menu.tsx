"use client";

import { IconDatabase, IconDots, IconTrash } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, type RefObject, useCallback, useState } from "react";

import { useMenuCommandKeys } from "@/components/keyboard/use-menu-command-keys.ts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  MenuIconRenameInput,
  shouldCancelMenuCloseForIconPicker,
} from "@/components/ui/menu-icon-rename-input.tsx";
import { Shortcut } from "@/components/ui/shortcut.tsx";
import { SidebarMenuAction } from "@/components/ui/sidebar.tsx";
import { setDatabaseIcon } from "@/db/queries/database-collection-ops.ts";
import { renameDatabase } from "@/db/queries/database-page-ops.ts";
import { navigateAfterDatabaseHubRename } from "@/lib/databases/navigate-after-database-rename.ts";

interface DatabaseSidebarRowMenuProps {
  databaseId: string;
  icon?: string;
  menuActionRef: RefObject<HTMLButtonElement | null>;
  name: string;
  onDelete: () => void;
}

/** Three-dot overflow menu for a database sidebar row. */
export function DatabaseSidebarRowMenu({
  databaseId,
  icon,
  menuActionRef,
  name,
  onDelete,
}: DatabaseSidebarRowMenuProps): ReactNode {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  // D (delete-page) is live only while this menu is open.
  const onMenuKeyDown = useMenuCommandKeys({
    "delete-page": onDelete,
  });

  const commitRename = useCallback(() => {
    const trimmed = draftName.trim();
    if (trimmed !== "" && trimmed !== name) {
      const change = renameDatabase(databaseId, trimmed);
      navigateAfterDatabaseHubRename(navigate, change);
    } else {
      setDraftName(name);
    }
  }, [databaseId, draftName, name, navigate]);

  const handleOpenChange = useCallback(
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
        setDraftName(name);
        setIconPickerOpen(false);
      } else {
        commitRename();
        setIconPickerOpen(false);
        menuActionRef.current?.blur();
      }
      setOpen(nextOpen);
    },
    [commitRename, iconPickerOpen, menuActionRef, name]
  );

  const writeIcon = useCallback(
    (nextIcon: string | undefined) => {
      setDatabaseIcon(databaseId, nextIcon);
    },
    [databaseId]
  );

  return (
    <DropdownMenu modal={false} onOpenChange={handleOpenChange} open={open}>
      <DropdownMenuTrigger
        nativeButton
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        render={
          <SidebarMenuAction
            aria-label={`Database actions for ${name}`}
            className="hover-reveal hover:bg-sidebar-accent-strong hover:text-sidebar-accent-foreground aria-expanded:bg-sidebar-accent-strong aria-expanded:text-sidebar-accent-foreground aria-expanded:opacity-100"
            render={<button ref={menuActionRef} type="button" />}
          >
            <IconDots />
          </SidebarMenuAction>
        }
      />
      <DropdownMenuContent
        align="start"
        className="w-64 min-w-64"
        onKeyDownCapture={onMenuKeyDown}
        side="bottom"
      >
        <MenuIconRenameInput
          ariaLabelIcon="Change database icon"
          ariaLabelName="Database name"
          draftName={draftName}
          fallbackIcon={<IconDatabase className="size-4 stroke-[1.5px]" />}
          icon={icon}
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
            setOpen(false);
          }}
          placeholder="Database name"
        />
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Database</DropdownMenuLabel>
          <DropdownMenuItem onClick={onDelete} variant="destructive">
            <IconTrash />
            Delete
            <DropdownMenuShortcut>
              <Shortcut command="delete-page" />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
