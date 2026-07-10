"use client";

import {
  IconDots,
  IconPencil,
  IconPhoto,
  IconTrash,
} from "@tabler/icons-react";
import type { RefObject } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { SidebarMenuAction } from "@/components/ui/sidebar.tsx";

interface DatabaseSidebarRowMenuProps {
  menuActionRef: RefObject<HTMLButtonElement | null>;
  onChangeIcon: () => void;
  onDelete: () => void;
  onRename: () => void;
  title: string;
}

/** Three-dot overflow menu for a database sidebar row. */
export function DatabaseSidebarRowMenu({
  menuActionRef,
  onChangeIcon,
  onDelete,
  onRename,
  title,
}: DatabaseSidebarRowMenuProps) {
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) {
          menuActionRef.current?.blur();
        }
      }}
    >
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
            aria-label={`Database actions for ${title}`}
            className="hover-reveal hover:bg-sidebar-accent-strong hover:text-sidebar-accent-foreground aria-expanded:bg-sidebar-accent-strong aria-expanded:text-sidebar-accent-foreground aria-expanded:opacity-100"
            render={<button ref={menuActionRef} type="button" />}
          >
            <IconDots />
          </SidebarMenuAction>
        }
      />
      <DropdownMenuContent align="start" side="bottom">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Database</DropdownMenuLabel>
          <DropdownMenuItem onClick={onRename}>
            <IconPencil />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onChangeIcon}>
            <IconPhoto />
            Change icon
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete} variant="destructive">
            <IconTrash />
            Delete
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
