"use client";

import {
  IconCopy,
  IconCopyOff,
  IconDeviceFloppy,
  IconFileImport,
  IconLink,
  IconRefresh,
  IconStar,
  IconStarOff,
  IconTrash,
} from "@tabler/icons-react";
import type { ReactNode } from "react";

import { PageHeaderMenuExportSubmenu } from "@/components/pages/page-header-menu-export-submenu.tsx";
import { PageMenuMoveSubmenu } from "@/components/pages/page-menu-move-submenu.tsx";
import { PageVersionHistorySubmenu } from "@/components/pages/page-version-history-submenu.tsx";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Shortcut } from "@/components/ui/shortcut.tsx";
import type { usePageCanvasFooterActions } from "@/hooks/use-page-canvas-footer-actions.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";

type FooterActions = ReturnType<typeof usePageCanvasFooterActions>;

/**
 * Page-lifecycle rows in the header ⋯ menu (copy / favorite / duplicate /
 * export / import / history / move / delete, plus narrow-viewport site
 * actions). Omitted entirely for template pages — those sit outside the
 * navigable tree, so the actions don't apply.
 */
export function PageHeaderMenuLifecycleSection({
  canDelete,
  duplicate,
  footerActions,
  isFavorite,
  isNarrowViewport,
  moveTo,
  onCopyLink,
  onDelete,
  onExportMarkdown,
  onExportZip,
  onImportMarkdown,
  onToggleFavorite,
  pageId,
  pages,
  runAfterClose,
}: {
  canDelete: boolean;
  duplicate: (withContent: boolean) => void;
  footerActions: FooterActions;
  isFavorite: boolean;
  isNarrowViewport: boolean;
  moveTo: (parentId: string | null) => void;
  onCopyLink: () => void;
  onDelete: () => void;
  onExportMarkdown: () => void;
  onExportZip: () => void;
  onImportMarkdown: () => void;
  onToggleFavorite: () => void;
  pageId: string;
  pages: PageSummary[];
  runAfterClose: (action: () => void) => void;
}): ReactNode {
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem onClick={onCopyLink}>
          <IconLink />
          Copy link
          <DropdownMenuShortcut>
            <Shortcut command="copy-page-link" />
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            runAfterClose(onToggleFavorite);
          }}
        >
          {isFavorite ? <IconStarOff /> : <IconStar />}
          {isFavorite ? "Remove from favorites" : "Add to favorites"}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <IconCopy />
            Duplicate page
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem
              onClick={() => {
                runAfterClose(() => {
                  duplicate(true);
                });
              }}
            >
              <IconCopy />
              With content
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                runAfterClose(() => {
                  duplicate(false);
                });
              }}
            >
              <IconCopyOff />
              Without content
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <PageHeaderMenuExportSubmenu
          onExportMarkdown={() => {
            runAfterClose(onExportMarkdown);
          }}
          onExportZip={() => {
            runAfterClose(onExportZip);
          }}
        />
        <DropdownMenuItem
          onClick={() => {
            runAfterClose(onImportMarkdown);
          }}
        >
          <IconFileImport />
          Import Markdown
        </DropdownMenuItem>
        <PageVersionHistorySubmenu pageId={pageId} />
        <PageMenuMoveSubmenu
          onMoveTo={(parentId) => {
            runAfterClose(() => {
              moveTo(parentId);
            });
          }}
          pageId={pageId}
          pages={pages}
          variant="dropdown"
        />
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        {isNarrowViewport && footerActions.visible ? (
          <>
            {footerActions.hasUpdates ? (
              <DropdownMenuItem
                onClick={() => {
                  footerActions.setConfirmAction("refresh");
                }}
              >
                <IconRefresh />
                Refresh site content
              </DropdownMenuItem>
            ) : null}
            {footerActions.isDev ? (
              <DropdownMenuItem
                onClick={() => {
                  footerActions.setConfirmAction("saveAll");
                }}
              >
                <IconDeviceFloppy />
                Save all to source
              </DropdownMenuItem>
            ) : null}
            {footerActions.hasLocalChanges ? (
              <>
                <DropdownMenuItem
                  onClick={() => {
                    footerActions.setConfirmAction("reset");
                  }}
                  variant="destructive"
                >
                  <IconRefresh />
                  Reset page
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    footerActions.setConfirmAction("resetAll");
                  }}
                  variant="destructive"
                >
                  <IconRefresh />
                  Reset all
                </DropdownMenuItem>
              </>
            ) : null}
          </>
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
    </>
  );
}
