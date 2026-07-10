"use client";

import {
  IconArrowsMaximize,
  IconCopy,
  IconCopyOff,
  IconDeviceFloppy,
  IconDots,
  IconFileExport,
  IconFileImport,
  IconLink,
  IconMarkdown,
  IconPhoto,
  IconRefresh,
  IconStar,
  IconStarOff,
  IconTrash,
} from "@tabler/icons-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ActionMenuSearchSection } from "@/components/canvas/action-menu-search.tsx";
import { PageCanvasConfirmDialog } from "@/components/canvas/page-canvas-confirm-dialog.tsx";
import { DeletePageConfirmDialog } from "@/components/pages/delete-page-confirm-dialog.tsx";
import { PageActivityPanel } from "@/components/pages/page-activity-panel.tsx";
import { usePageCover } from "@/components/pages/page-cover-context.tsx";
import { PageHeaderMenuExportSubmenu } from "@/components/pages/page-header-menu-export-submenu.tsx";
import { PageHeaderMenuFontSubmenu } from "@/components/pages/page-header-menu-font-submenu.tsx";
import { PageHeaderMenuTextSizeSubmenu } from "@/components/pages/page-header-menu-text-size-submenu.tsx";
import { PageMenuMoveSubmenu } from "@/components/pages/page-menu-move-submenu.tsx";
import { PageVersionHistorySubmenu } from "@/components/pages/page-version-history-submenu.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSwitchItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Shortcut } from "@/components/ui/shortcut.tsx";
import { useIsNarrowViewport } from "@/hooks/device-layout.ts";
import { useFavoriteActions, useIsFavorite } from "@/hooks/use-favorites.ts";
import { useImportMarkdownPage } from "@/hooks/use-import-markdown-page.ts";
import { usePageActions } from "@/hooks/use-page-actions.ts";
import {
  type PageCanvasFooterActionsInput,
  usePageCanvasFooterActions,
} from "@/hooks/use-page-canvas-footer-actions.ts";
import { usePageSettings } from "@/hooks/use-page-settings.ts";
import type { ActionMenuEntry } from "@/lib/canvas/filter-action-menu-items.ts";
import { exportPageArchive } from "@/lib/content/workspace-export.ts";
import { exportPageMarkdown } from "@/lib/markdown/export-page-markdown.ts";
import type { PageMetadataSeed } from "@/lib/pages/persist-page-metadata.ts";
import type { Page } from "@/lib/schemas/page.ts";

interface PageHeaderMenuProps extends PageCanvasFooterActionsInput {
  pageId: string;
  seed?: PageMetadataSeed;
  serverPage?: Pick<
    Page,
    "font" | "fullWidth" | "headerImage" | "textScale"
  > | null;
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
  const cover = usePageCover();
  const headerImage = cover?.headerImage;
  const { font, fullWidth, setFont, setFullWidth, setTextScale, textScale } =
    usePageSettings({
      pageId,
      seed,
      serverPage,
    });
  const { canDelete, copyLink, deletePage, duplicate, moveTo, pages } =
    usePageActions(pageId);
  const isFavorite = useIsFavorite(pageId);
  const { toggleFavorite } = useFavoriteActions();
  const footerActions = usePageCanvasFooterActions({ onAfterReset, pageId });
  const importMarkdownPage = useImportMarkdownPage();
  const importInputRef = useRef<HTMLInputElement>(null);

  const runExportPage = useCallback(() => {
    exportPageArchive(pageId)
      .then((result) => {
        toast.success(
          result.assetCount > 0
            ? `Page exported with ${result.assetCount} media file${result.assetCount === 1 ? "" : "s"}.`
            : "Page exported."
        );
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Export failed.");
      });
  }, [pageId]);

  const runExportMarkdown = useCallback(() => {
    exportPageMarkdown(pageId, pages)
      .then(() => {
        toast.success("Page exported as Markdown.");
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Export failed.");
      });
  }, [pageId, pages]);

  const runImportMarkdown = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) {
        return;
      }
      importMarkdownPage(file)
        .then(() => {
          toast.success(`Imported “${file.name}”.`);
        })
        .catch((error) => {
          toast.error(
            error instanceof Error ? error.message : "Import failed."
          );
        });
    },
    [importMarkdownPage]
  );

  const searchableEntries = useMemo((): ActionMenuEntry[] => {
    const entries: ActionMenuEntry[] = [
      {
        id: "cover-image",
        label: headerImage ? "Change cover" : "Add cover",
        icon: <IconPhoto />,
        keywords: ["cover", "header", "image", "photo", "banner", "unsplash"],
        onSelect: () => {
          cover?.openPicker();
        },
      },
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
        id: "favorite",
        label: isFavorite ? "Remove from favorites" : "Add to favorites",
        icon: isFavorite ? <IconStarOff /> : <IconStar />,
        keywords: ["favorite", "favourite", "star", "pin", "bookmark"],
        onSelect: () => {
          toggleFavorite(pageId);
        },
      },
      {
        id: "duplicate",
        label: "Duplicate page",
        icon: <IconCopy />,
        keywords: ["duplicate", "copy", "clone"],
        onSelect: () => {
          duplicate(true);
        },
      },
      {
        id: "duplicate-shell",
        label: "Duplicate without content",
        icon: <IconCopyOff />,
        keywords: ["duplicate", "copy", "clone", "shell", "empty", "blank"],
        onSelect: () => {
          duplicate(false);
        },
      },
      {
        id: "export-zip",
        label: "Export page (.zip)",
        icon: <IconFileExport />,
        keywords: ["export", "download", "backup", "zip", "archive", "save"],
        onSelect: runExportPage,
      },
      {
        id: "export-markdown",
        label: "Export page (.md)",
        icon: <IconMarkdown />,
        keywords: ["export", "markdown", "md", "download", "text"],
        onSelect: runExportMarkdown,
      },
      {
        id: "import-markdown",
        label: "Import Markdown",
        icon: <IconFileImport />,
        keywords: ["import", "markdown", "md", "upload", "new page"],
        onSelect: runImportMarkdown,
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
  }, [
    copyLink,
    cover,
    duplicate,
    footerActions,
    headerImage,
    isFavorite,
    isNarrowViewport,
    pageId,
    runExportMarkdown,
    runExportPage,
    runImportMarkdown,
    toggleFavorite,
  ]);

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
      <input
        accept=".md,.markdown,.mdown,text/markdown"
        className="hidden"
        onChange={handleImportFile}
        ref={importInputRef}
        type="file"
      />
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
        <DropdownMenuContent align="end">
          <ActionMenuSearchSection
            activeKey={open ? pageId : null}
            items={searchableEntries}
          >
            <PageHeaderMenuFontSubmenu
              font={font}
              onFontChange={(nextFont) => {
                setFont(nextFont);
              }}
            />
            <PageHeaderMenuTextSizeSubmenu
              onTextScaleChange={setTextScale}
              textScale={textScale}
            />
            {isNarrowViewport ? null : (
              <DropdownMenuSwitchItem
                checked={fullWidth}
                onCheckedChange={setFullWidth}
              >
                <IconArrowsMaximize />
                Full width
              </DropdownMenuSwitchItem>
            )}
            <DropdownMenuItem
              onClick={() => {
                runAfterClose(() => {
                  cover?.openPicker();
                });
              }}
            >
              <IconPhoto />
              {headerImage ? "Change cover" : "Add cover"}
            </DropdownMenuItem>
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
                  runAfterClose(() => {
                    toggleFavorite(pageId);
                  });
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
                    <DropdownMenuShortcut>
                      <Shortcut command="duplicate-page" />
                    </DropdownMenuShortcut>
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
                  runAfterClose(runExportMarkdown);
                }}
                onExportZip={() => {
                  runAfterClose(runExportPage);
                }}
              />
              <DropdownMenuItem
                onClick={() => {
                  runAfterClose(runImportMarkdown);
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

      <DeletePageConfirmDialog
        onConfirm={handleDelete}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        pageId={pageId}
      />

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
