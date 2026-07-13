"use client";

import { IconDots } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import type { RefObject } from "react";

import { useMenuCommandKeys } from "@/components/keyboard/use-menu-command-keys.ts";
import {
  PageRowMenuContent,
  rowMenuCommandHandlers,
} from "@/components/pages/page-row-menu-content.tsx";
import { useTemplatePage } from "@/components/pages/template-page-provider.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { SidebarMenuAction } from "@/components/ui/sidebar.tsx";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { openTemplateEditor } from "@/lib/pages/open-template-editor.ts";

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
  const navigate = useNavigate();
  const { setTemplatePageId } = useTemplatePage();
  const onEditTemplate = () => openTemplateEditor(navigate, setTemplatePageId);

  // Single-key shortcuts (F/D/Backspace/E/T) are live only while this dropdown
  // is open and act on this row.
  const onMenuKeyDown = useMenuCommandKeys(
    rowMenuCommandHandlers({
      canDelete,
      onDelete,
      onDuplicate,
      onEditTemplate,
      onSaveAsTemplate,
      onToggleFavorite,
    })
  );

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
        onKeyDownCapture={onMenuKeyDown}
        side="bottom"
      >
        <PageRowMenuContent
          canDelete={canDelete}
          canResetToRemote={canResetToRemote}
          isFavorite={isFavorite}
          onChangeIcon={onChangeIcon}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onEditTemplate={onEditTemplate}
          onMoveTo={onMoveTo}
          onRename={onRename}
          onResetToRemote={onResetToRemote}
          onSaveAsTemplate={onSaveAsTemplate}
          onToggleFavorite={onToggleFavorite}
          pageId={pageId}
          pages={pages}
          variant="dropdown"
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
