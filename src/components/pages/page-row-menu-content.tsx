"use client";

import {
  IconCopy,
  IconCopyOff,
  IconEdit,
  IconLayoutGrid,
  IconPencil,
  IconPhoto,
  IconRefresh,
  IconStar,
  IconStarOff,
  IconTrash,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import type { ComponentType, MouseEvent, ReactNode } from "react";

import { PageActivityPanel } from "@/components/pages/page-activity-panel.tsx";
import { PageMenuMoveSubmenu } from "@/components/pages/page-menu-move-submenu.tsx";
import { useTemplatePage } from "@/components/pages/template-page-provider.tsx";
import {
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu.tsx";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Shortcut } from "@/components/ui/shortcut.tsx";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { openTemplateEditor } from "@/lib/pages/open-template-editor.ts";

interface MenuNodeProps {
  children?: ReactNode;
}
interface MenuItemProps {
  children?: ReactNode;
  disabled?: boolean;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  variant?: "default" | "destructive";
}

/** The subset of a menu primitive family that the row menu renders into. */
interface RowMenuPrimitives {
  Group: ComponentType<MenuNodeProps>;
  Item: ComponentType<MenuItemProps>;
  Label: ComponentType<MenuNodeProps>;
  Separator: ComponentType<{ className?: string }>;
  Shortcut: ComponentType<MenuNodeProps>;
  Sub: ComponentType<MenuNodeProps>;
  SubContent: ComponentType<MenuNodeProps>;
  SubTrigger: ComponentType<{ children?: ReactNode; disabled?: boolean }>;
}

const DROPDOWN_PRIMITIVES: RowMenuPrimitives = {
  Group: DropdownMenuGroup,
  Item: DropdownMenuItem,
  Label: DropdownMenuLabel,
  Separator: DropdownMenuSeparator,
  Shortcut: DropdownMenuShortcut,
  Sub: DropdownMenuSub,
  SubContent: DropdownMenuSubContent,
  SubTrigger: DropdownMenuSubTrigger,
};

const CONTEXT_PRIMITIVES: RowMenuPrimitives = {
  Group: ContextMenuGroup,
  Item: ContextMenuItem,
  Label: ContextMenuLabel,
  Separator: ContextMenuSeparator,
  Shortcut: ContextMenuShortcut,
  Sub: ContextMenuSub,
  SubContent: ContextMenuSubContent,
  SubTrigger: ContextMenuSubTrigger,
};

export interface PageRowMenuContentProps {
  canDelete: boolean;
  canResetToRemote: boolean;
  isFavorite: boolean;
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
  /** Which Base UI menu primitive set to render within. */
  variant: "context" | "dropdown";
}

/**
 * The item list shared by the sidebar page-row "⋯" dropdown and its right-click
 * context menu, so both surfaces render an identical menu. `variant` selects the
 * matching Base UI primitive family (dropdown vs context); everything else —
 * order, labels, shortcut hints — stays in this single source of truth.
 */
export function PageRowMenuContent({
  canDelete,
  canResetToRemote,
  isFavorite,
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
  variant,
}: PageRowMenuContentProps) {
  const navigate = useNavigate();
  const { setTemplatePageId } = useTemplatePage();
  const P = variant === "context" ? CONTEXT_PRIMITIVES : DROPDOWN_PRIMITIVES;

  return (
    <>
      <P.Group>
        <P.Label>Page</P.Label>
        <P.Item onClick={onToggleFavorite}>
          {isFavorite ? <IconStarOff /> : <IconStar />}
          {isFavorite ? "Remove from favorites" : "Add to favorites"}
          <P.Shortcut>
            <Shortcut command="toggle-favorite" />
          </P.Shortcut>
        </P.Item>
        <P.Item onClick={onRename}>
          <IconPencil />
          Rename
        </P.Item>
        <P.Item onClick={onChangeIcon}>
          <IconPhoto />
          Change icon
        </P.Item>
        <P.Sub>
          <P.SubTrigger>
            <IconCopy />
            Duplicate page
          </P.SubTrigger>
          <P.SubContent>
            <P.Item
              onClick={() => {
                onDuplicate(true);
              }}
            >
              <IconCopy />
              With content
              <P.Shortcut>
                <Shortcut command="duplicate-page" />
              </P.Shortcut>
            </P.Item>
            <P.Item
              onClick={() => {
                onDuplicate(false);
              }}
            >
              <IconCopyOff />
              Without content
            </P.Item>
          </P.SubContent>
        </P.Sub>
        <PageMenuMoveSubmenu
          onMoveTo={onMoveTo}
          pageId={pageId}
          pages={pages}
          variant={variant}
        />
        <P.Item onClick={onSaveAsTemplate}>
          <IconLayoutGrid />
          Save as template
          <P.Shortcut>
            <Shortcut command="save-as-template" />
          </P.Shortcut>
        </P.Item>
        <P.Item
          onClick={() => {
            openTemplateEditor(navigate, setTemplatePageId);
          }}
        >
          <IconEdit />
          Edit template
          <P.Shortcut>
            <Shortcut command="edit-template" />
          </P.Shortcut>
        </P.Item>
        {canResetToRemote ? (
          <P.Item onClick={onResetToRemote}>
            <IconRefresh />
            Reset to site version
          </P.Item>
        ) : null}
        <P.Item disabled={!canDelete} onClick={onDelete} variant="destructive">
          <IconTrash />
          Delete
          <P.Shortcut>
            <Shortcut command="delete-page" />
          </P.Shortcut>
        </P.Item>
      </P.Group>
      <P.Separator />
      <PageActivityPanel pageId={pageId} />
    </>
  );
}
