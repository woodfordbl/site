"use client";

import {
  IconCopy,
  IconDeviceFloppy,
  IconDots,
  IconHistory,
  IconLink,
  IconRefresh,
  IconTextSize,
  IconTrash,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { ActionMenuSearchSection } from "@/components/canvas/action-menu-search.tsx";
import { PageCanvasConfirmDialog } from "@/components/canvas/page-canvas-confirm-dialog.tsx";
import { PageActivityPanel } from "@/components/pages/page-activity-panel.tsx";
import { PageHeaderMenuFontRow } from "@/components/pages/page-header-menu-font-row.tsx";
import { PageHeaderMenuMoveSubmenu } from "@/components/pages/page-header-menu-move-submenu.tsx";
import { PageVersionHistoryView } from "@/components/pages/page-version-history-view.tsx";
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
import {
  type PageCanvasFooterActionsInput,
  usePageCanvasFooterActions,
} from "@/hooks/use-page-canvas-footer-actions.ts";
import { usePageSettings } from "@/hooks/use-page-settings.ts";
import type { ActionMenuEntry } from "@/lib/canvas/filter-action-menu-items.ts";
import type { PageMetadataSeed } from "@/lib/pages/persist-page-metadata.ts";
import type { Page } from "@/lib/schemas/page.ts";

interface PageHeaderMenuProps extends PageCanvasFooterActionsInput {
  pageId: string;
  seed?: PageMetadataSeed;
  serverPage?: Pick<Page, "font" | "smallText"> | null;
}

export function PageHeaderMenu({
  onAfterReset,
  pageId,
  seed,
  serverPage,
}: PageHeaderMenuProps) {
  const isNarrowViewport = useIsNarrowViewport();
  const [open, setOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { font, setFont, setSmallText, smallText } = usePageSettings({
    pageId,
    seed,
    serverPage,
  });
  const { canDelete, copyLink, deletePage, duplicate, moveTo, pages } =
    usePageActions(pageId);
  const footerActions = usePageCanvasFooterActions({ onAfterReset, pageId });

  const searchableEntries = useMemo((): ActionMenuEntry[] => {
    const entries: ActionMenuEntry[] = [
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
        id: "version-history",
        label: "Version history",
        icon: <IconHistory />,
        keywords: ["version", "history", "restore", "revert", "snapshot"],
        onSelect: () => {
          setOpen(false);
          setHistoryOpen(true);
        },
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
    ];

    if (isNarrowViewport && footerActions.visible) {
      if (footerActions.hasUpdates) {
        entries.push({
          id: "refresh",
          label: "Refresh site content",
          icon: <IconRefresh />,
          keywords: ["refresh", "sync", "remote", "site"],
          onSelect: () => {
            footerActions.setConfirmAction("refresh");
          },
        });
      }
      if (footerActions.isDev) {
        entries.push({
          id: "save-all",
          label: "Save all to source",
          icon: <IconDeviceFloppy />,
          keywords: ["save", "source", "dev", "export"],
          onSelect: () => {
            footerActions.setConfirmAction("saveAll");
          },
        });
      }
      if (footerActions.hasLocalChanges) {
        entries.push({
          id: "reset-page",
          label: "Reset page",
          icon: <IconRefresh />,
          keywords: ["reset", "revert", "remote"],
          destructive: true,
          onSelect: () => {
            footerActions.setConfirmAction("reset");
          },
        });
        entries.push({
          id: "reset-all",
          label: "Reset all",
          icon: <IconRefresh />,
          keywords: ["reset", "all", "revert"],
          destructive: true,
          onSelect: () => {
            footerActions.setConfirmAction("resetAll");
          },
        });
      }
    }

    return entries;
  }, [copyLink, duplicate, footerActions, isNarrowViewport]);

  const handleDelete = () => {
    deletePage();
    setDeleteOpen(false);
    setOpen(false);
  };

  const openHistory = () => {
    setOpen(false);
    setHistoryOpen(true);
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
              <DropdownMenuItem onClick={openHistory}>
                <IconHistory />
                Version history
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
            {isNarrowViewport && footerActions.visible ? (
              <>
                <DropdownMenuSeparator />
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
            <DropdownMenuSeparator />
            <PageActivityPanel pageId={pageId} />
          </ActionMenuSearchSection>
        </DropdownMenuContent>
      </DropdownMenu>

      <PageVersionHistoryView
        onOpenChange={setHistoryOpen}
        open={historyOpen}
        pageId={pageId}
      />

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

      <PageCanvasConfirmDialog
        confirmAction={footerActions.confirmAction}
        onConfirm={footerActions.handleConfirm}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            footerActions.setConfirmAction(null);
          }
        }}
      />
    </>
  );
}
