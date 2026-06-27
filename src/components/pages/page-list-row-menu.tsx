"use client";

import {
  IconCopy,
  IconDots,
  IconPencil,
  IconPhoto,
  IconRefresh,
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

interface PageListRowDropdownProps {
  canDelete: boolean;
  canResetToRemote: boolean;
  menuActionRef: RefObject<HTMLButtonElement | null>;
  onChangeIcon: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onResetToRemote: () => void;
  title: string;
}

export function PageListRowDropdown({
  canDelete,
  canResetToRemote,
  menuActionRef,
  onChangeIcon,
  onDelete,
  onDuplicate,
  onRename,
  onResetToRemote,
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
            className="hover-reveal hover:bg-sidebar-accent-strong hover:text-sidebar-accent-foreground aria-expanded:bg-sidebar-accent-strong aria-expanded:text-sidebar-accent-foreground aria-expanded:opacity-100"
            render={<button ref={menuActionRef} type="button" />}
          >
            <IconDots />
          </SidebarMenuAction>
        }
      />
      <DropdownMenuContent
        align="start"
        className="w-56 min-w-56 [--accent-foreground:var(--sidebar-accent-foreground)] [--accent:var(--sidebar-accent)]"
        side="bottom"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Page</DropdownMenuLabel>
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
          {canResetToRemote ? (
            <DropdownMenuItem onClick={onResetToRemote}>
              <IconRefresh />
              Reset to site version
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            disabled={!canDelete}
            onClick={onDelete}
            variant="destructive"
          >
            <IconTrash />
            Delete
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
