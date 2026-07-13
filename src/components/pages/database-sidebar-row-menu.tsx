"use client";

import { IconDatabase, IconDots, IconTrash } from "@tabler/icons-react";
import { type ReactNode, type RefObject, useCallback, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  MenuIconRenameInput,
  shouldCancelMenuCloseForIconPicker,
} from "@/components/ui/menu-icon-rename-input.tsx";
import { SidebarMenuAction } from "@/components/ui/sidebar.tsx";
import { setDatabaseIcon } from "@/db/queries/database-collection-ops.ts";
import { renameDatabase } from "@/db/queries/database-page-ops.ts";

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
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const commitRename = useCallback(() => {
    const trimmed = draftName.trim();
    if (trimmed !== "" && trimmed !== name) {
      renameDatabase(databaseId, trimmed);
    } else {
      setDraftName(name);
    }
  }, [databaseId, draftName, name]);

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
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
