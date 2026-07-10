"use client";

import {
  IconCopy,
  IconCopyOff,
  IconDots,
  IconLayoutGrid,
  IconPencil,
  IconPhoto,
  IconRefresh,
  IconStar,
  IconStarOff,
  IconTrash,
} from "@tabler/icons-react";
import type { RefObject } from "react";

import { PageActivityPanel } from "@/components/pages/page-activity-panel.tsx";
import { PageMenuMoveSubmenu } from "@/components/pages/page-menu-move-submenu.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Shortcut } from "@/components/ui/shortcut.tsx";
import { SidebarMenuAction } from "@/components/ui/sidebar.tsx";
import type { PageSummary } from "@/lib/content/list-pages.ts";

interface PageListRowDropdownProps {
  canDelete: boolean;
  canResetToRemote: boolean;
  isFavorite: boolean;
  menuActionRef: RefObject<HTMLButtonElement | null>;
  onChangeIcon: () => void;
  onDelete: () => void;
  onDuplicate: (withContent: boolean) => void;
  onMoveTo: (parentId: string | null) => void;
  onRename: () => void;
  onResetToRemote: () => void;
  onSaveAsTemplate: () => void;
  onToggleFavorite: () => void;
  pageId: string;
  pages: PageSummary[];
  title: string;
}

export function PageListRowDropdown({
  canDelete,
  canResetToRemote,
  isFavorite,
  menuActionRef,
  onChangeIcon,
  onDelete,
  onDuplicate,
  onMoveTo,
  onRename,
  onResetToRemote,
  onSaveAsTemplate,
  onToggleFavorite,
  pageId,
  pages,
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
      <DropdownMenuContent align="start" side="bottom">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Page</DropdownMenuLabel>
          <DropdownMenuItem onClick={onToggleFavorite}>
            {isFavorite ? <IconStarOff /> : <IconStar />}
            {isFavorite ? "Remove from favorites" : "Add to favorites"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onRename}>
            <IconPencil />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onChangeIcon}>
            <IconPhoto />
            Change icon
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <IconCopy />
              Duplicate page
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                onClick={() => {
                  onDuplicate(true);
                }}
              >
                <IconCopy />
                With content
                <DropdownMenuShortcut>
                  <Shortcut command="duplicate-page" />
                </DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  onDuplicate(false);
                }}
              >
                <IconCopyOff />
                Without content
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <PageMenuMoveSubmenu
            onMoveTo={onMoveTo}
            pageId={pageId}
            pages={pages}
            variant="dropdown"
          />
          <DropdownMenuItem onClick={onSaveAsTemplate}>
            <IconLayoutGrid />
            Save as template
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
        <DropdownMenuSeparator />
        <PageActivityPanel pageId={pageId} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
