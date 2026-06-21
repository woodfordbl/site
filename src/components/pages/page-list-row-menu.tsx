"use client";

import {
  IconCopy,
  IconDotsVertical,
  IconPencil,
  IconPhoto,
  IconTrash,
} from "@tabler/icons-react";
import type { RefObject } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { SidebarMenuAction } from "@/components/ui/sidebar.tsx";

interface PageListRowDropdownProps {
  canDelete: boolean;
  menuActionRef: RefObject<HTMLButtonElement | null>;
  onChangeIcon: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  title: string;
}

export function PageListRowDropdown({
  canDelete,
  menuActionRef,
  onChangeIcon,
  onDelete,
  onDuplicate,
  onRename,
  title,
}: PageListRowDropdownProps) {
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
            aria-label={`Page actions for ${title}`}
            className="transition-opacity duration-150 ease-[var(--ease-out-strong)] hover:bg-sidebar-accent-strong hover:text-sidebar-accent-foreground group-hover/page-row:opacity-100 group-focus-visible/page-row:opacity-100 aria-expanded:bg-sidebar-accent-strong aria-expanded:text-sidebar-accent-foreground aria-expanded:opacity-100 md:opacity-0"
            render={<button ref={menuActionRef} type="button" />}
          >
            <IconDotsVertical />
          </SidebarMenuAction>
        }
      />
      <DropdownMenuContent
        align="start"
        className="w-56 min-w-56"
        side="bottom"
      >
        <DropdownMenuItem onClick={onRename}>
          <IconPencil />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onChangeIcon}>
          <IconPhoto />
          Change icon
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDuplicate}>
          <IconCopy />
          Duplicate page
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canDelete}
          onClick={onDelete}
          variant="destructive"
        >
          <IconTrash />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
