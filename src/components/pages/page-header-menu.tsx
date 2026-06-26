"use client";

import {
  IconArrowsMaximize,
  IconCopy,
  IconDots,
  IconLink,
  IconTextSize,
  IconTrash,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { ActionMenuSearchSection } from "@/components/canvas/action-menu-search.tsx";
import { PageActivityPanel } from "@/components/pages/page-activity-panel.tsx";
import { PageHeaderMenuFontRow } from "@/components/pages/page-header-menu-font-row.tsx";
import { PageHeaderMenuMoveSubmenu } from "@/components/pages/page-header-menu-move-submenu.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSwitchItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { useIsNarrowViewport } from "@/hooks/device-layout.ts";
import { usePageActions } from "@/hooks/use-page-actions.ts";
import { usePageSettings } from "@/hooks/use-page-settings.ts";
import type { ActionMenuEntry } from "@/lib/canvas/filter-action-menu-items.ts";
import type { PageMetadataSeed } from "@/lib/pages/persist-page-metadata.ts";
import type { Page } from "@/lib/schemas/page.ts";

interface PageHeaderMenuProps {
  pageId: string;
  seed?: PageMetadataSeed;
  serverPage?: Pick<Page, "font" | "fullWidth" | "smallText"> | null;
}

export function PageHeaderMenu({
  pageId,
  seed,
  serverPage,
}: PageHeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const isNarrowViewport = useIsNarrowViewport();
  const { font, fullWidth, setFont, setFullWidth, setSmallText, smallText } =
    usePageSettings({
      pageId,
      seed,
      serverPage,
    });
  const { canDelete, copyLink, deletePage, duplicate, moveTo, pages } =
    usePageActions(pageId);

  const searchableEntries = useMemo(
    (): ActionMenuEntry[] => [
      {
        id: "copy-link",
        label: "Copy link",
        icon: <IconLink />,
        keywords: ["copy", "link", "url", "share"],
        onSelect: () => {
          copyLink().catch(() => undefined);
        },
      },
      {
        id: "duplicate",
        label: "Duplicate page",
        icon: <IconCopy />,
        keywords: ["duplicate", "copy", "clone"],
        onSelect: duplicate,
      },
      {
        id: "delete",
        label: "Delete",
        icon: <IconTrash />,
        keywords: ["delete", "remove", "trash"],
        destructive: true,
        onSelect: () => {
          setDeleteOpen(true);
        },
      },
    ],
    [copyLink, duplicate]
  );

  const handleDelete = () => {
    deletePage();
    setDeleteOpen(false);
    setOpen(false);
  };

  const runAfterClose = (action: () => void) => {
    setOpen(false);
    queueMicrotask(action);
  };

  return (
    <>
      <DropdownMenu onOpenChange={setOpen} open={open}>
        <DropdownMenuTrigger
          nativeButton
          render={
            <Button
              aria-label="Page settings and actions"
              className="shrink-0 text-muted-foreground"
              size="icon-sm"
              type="button"
              variant="ghost"
            />
          }
        >
          <IconDots aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-64">
          <ActionMenuSearchSection
            activeKey={open ? pageId : null}
            items={searchableEntries}
          >
            <PageHeaderMenuFontRow
              font={font}
              onFontChange={(nextFont) => {
                setFont(nextFont);
              }}
            />
            <DropdownMenuSwitchItem
              checked={smallText}
              onCheckedChange={setSmallText}
            >
              <IconTextSize />
              Small text
            </DropdownMenuSwitchItem>
            {isNarrowViewport ? null : (
              <DropdownMenuSwitchItem
                checked={fullWidth}
                onCheckedChange={setFullWidth}
              >
                <IconArrowsMaximize />
                Full width
              </DropdownMenuSwitchItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => {
                  runAfterClose(() => {
                    copyLink().catch(() => undefined);
                  });
                }}
              >
                <IconLink />
                Copy link
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  runAfterClose(duplicate);
                }}
              >
                <IconCopy />
                Duplicate page
              </DropdownMenuItem>
              <PageHeaderMenuMoveSubmenu
                onMoveTo={(parentId) => {
                  runAfterClose(() => {
                    moveTo(parentId);
                  });
                }}
                pageId={pageId}
                pages={pages}
              />
              <DropdownMenuItem
                disabled={!canDelete}
                onClick={() => {
                  setDeleteOpen(true);
                }}
                variant="destructive"
              >
                <IconTrash />
                Delete
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <PageActivityPanel pageId={pageId} />
          </ActionMenuSearchSection>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete page?</DialogTitle>
            <DialogDescription>
              This page and its subpages will be removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => {
                setDeleteOpen(false);
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={handleDelete} type="button" variant="destructive">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
