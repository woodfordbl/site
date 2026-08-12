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

import { ActionMenuSearchSection } from "@/components/canvas/action-menu-search.tsx";
import { PageCanvasConfirmDialog } from "@/components/canvas/page-canvas-confirm-dialog.tsx";
import { DeletePageConfirmDialog } from "@/components/pages/delete-page-confirm-dialog.tsx";
import { PageActivityPanel } from "@/components/pages/page-activity-panel.tsx";
import { usePageCover } from "@/components/pages/page-cover-context.tsx";
import { PageHeaderMenuFontSubmenu } from "@/components/pages/page-header-menu-font-submenu.tsx";
import { PageHeaderMenuLifecycleSection } from "@/components/pages/page-header-menu-lifecycle.tsx";
import { PageHeaderMenuTextSizeSubmenu } from "@/components/pages/page-header-menu-text-size-submenu.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSwitchItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { standardActionMenuWidthClassName } from "@/components/ui/menu-widths.ts";
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
import { isDatabaseTemplatePageId } from "@/lib/databases/database-template-page.ts";
import { exportPageMarkdown } from "@/lib/markdown/export-page-markdown.ts";
import type { PageMetadataSeed } from "@/lib/pages/persist-page-metadata.ts";
import { isTemplatePageId } from "@/lib/pages/template-page.ts";
import type { Page } from "@/lib/schemas/page.ts";
import { appToast } from "@/lib/toast/app-toast.ts";
import {
  TOAST_ID_EXPORT_MARKDOWN,
  TOAST_ID_EXPORT_MARKDOWN_ERROR,
  TOAST_ID_EXPORT_PAGE,
  TOAST_ID_EXPORT_PAGE_ERROR,
  TOAST_ID_IMPORT_MARKDOWN,
  TOAST_ID_IMPORT_MARKDOWN_ERROR,
} from "@/lib/toast/toast-ids.ts";

interface PageHeaderMenuProps extends PageCanvasFooterActionsInput {
  pageId: string;
  seed?: PageMetadataSeed;
  serverPage?: Pick<
    Page,
    "font" | "fullWidth" | "headerImage" | "textScale"
  > | null;
}

/** Cover + (for navigable pages) lifecycle search rows for the ⋯ menu filter. */
function buildPageHeaderMenuSearchEntries({
  coverOpenPicker,
  duplicate,
  footerActions,
  headerImage,
  isFavorite,
  isNarrowViewport,
  isTemplatePage,
  pageId,
  runCopyLink,
  runExportMarkdown,
  runExportPage,
  runImportMarkdown,
  setDeleteOpen,
  toggleFavorite,
}: {
  coverOpenPicker: (() => void) | undefined;
  duplicate: (withContent: boolean) => void;
  footerActions: ReturnType<typeof usePageCanvasFooterActions>;
  headerImage: Page["headerImage"] | null | undefined;
  isFavorite: boolean;
  isNarrowViewport: boolean;
  isTemplatePage: boolean;
  pageId: string;
  runCopyLink: () => void;
  runExportMarkdown: () => void;
  runExportPage: () => void;
  runImportMarkdown: () => void;
  setDeleteOpen: (open: boolean) => void;
  toggleFavorite: (pageId: string) => void;
}): ActionMenuEntry[] {
  const entries: ActionMenuEntry[] = [
    {
      id: "cover-image",
      label: headerImage ? "Change cover" : "Add cover",
      icon: <IconPhoto />,
      keywords: ["cover", "header", "image", "photo", "banner", "unsplash"],
      onSelect: () => {
        coverOpenPicker?.();
      },
    },
  ];

  if (!isTemplatePage) {
    entries.push(
      {
        id: "copy-link",
        label: "Copy link",
        icon: <IconLink />,
        keywords: ["copy", "link", "url", "share"],
        command: "copy-page-link",
        onSelect: runCopyLink,
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
      }
    );
  }

  if (isTemplatePage || !(isNarrowViewport && footerActions.visible)) {
    return entries;
  }

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

  return entries;
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
  // Site page template + per-database row templates sit outside the page tree —
  // duplicate / export / favorites / move / delete don't apply to them.
  const isTemplatePage =
    isTemplatePageId(pageId) || isDatabaseTemplatePageId(pageId);
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

  // Start the clipboard write inside the click itself. Deferring it past the
  // menu close (the way runAfterClose does) drops the user activation Safari
  // requires for navigator.clipboard.writeText.
  const runCopyLink = useCallback(() => {
    setOpen(false);
    copyLink().catch(() => undefined);
  }, [copyLink]);

  const runExportPage = useCallback(() => {
    exportPageArchive(pageId)
      .then((result) => {
        appToast.success(
          result.assetCount > 0
            ? `Page exported with ${result.assetCount} media file${result.assetCount === 1 ? "" : "s"}.`
            : "Page exported.",
          { id: TOAST_ID_EXPORT_PAGE }
        );
      })
      .catch((error) => {
        appToast.error(
          error instanceof Error ? error.message : "Export failed.",
          {
            id: TOAST_ID_EXPORT_PAGE_ERROR,
          }
        );
      });
  }, [pageId]);

  const runExportMarkdown = useCallback(() => {
    exportPageMarkdown(pageId, pages)
      .then(() => {
        appToast.success("Page exported as Markdown.", {
          id: TOAST_ID_EXPORT_MARKDOWN,
        });
      })
      .catch((error) => {
        appToast.error(
          error instanceof Error ? error.message : "Export failed.",
          {
            id: TOAST_ID_EXPORT_MARKDOWN_ERROR,
          }
        );
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
          appToast.success(`Imported “${file.name}”.`, {
            id: TOAST_ID_IMPORT_MARKDOWN,
          });
        })
        .catch((error) => {
          appToast.error(
            error instanceof Error ? error.message : "Import failed.",
            { id: TOAST_ID_IMPORT_MARKDOWN_ERROR }
          );
        });
    },
    [importMarkdownPage]
  );

  const searchableEntries = useMemo(
    () =>
      buildPageHeaderMenuSearchEntries({
        coverOpenPicker: cover?.openPicker,
        duplicate,
        footerActions,
        headerImage,
        isFavorite,
        isNarrowViewport,
        isTemplatePage,
        pageId,
        runCopyLink,
        runExportMarkdown,
        runExportPage,
        runImportMarkdown,
        setDeleteOpen,
        toggleFavorite,
      }),
    [
      cover?.openPicker,
      duplicate,
      footerActions,
      headerImage,
      isFavorite,
      isNarrowViewport,
      isTemplatePage,
      pageId,
      runCopyLink,
      runExportMarkdown,
      runExportPage,
      runImportMarkdown,
      toggleFavorite,
    ]
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
        <DropdownMenuContent
          align="end"
          className={standardActionMenuWidthClassName}
        >
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
            {isTemplatePage ? null : (
              <PageHeaderMenuLifecycleSection
                canDelete={canDelete}
                duplicate={duplicate}
                footerActions={footerActions}
                isFavorite={isFavorite}
                isNarrowViewport={isNarrowViewport}
                moveTo={moveTo}
                onCopyLink={runCopyLink}
                onDelete={() => {
                  setDeleteOpen(true);
                }}
                onExportMarkdown={runExportMarkdown}
                onExportZip={runExportPage}
                onImportMarkdown={runImportMarkdown}
                onToggleFavorite={() => {
                  toggleFavorite(pageId);
                }}
                pageId={pageId}
                pages={pages}
                runAfterClose={runAfterClose}
              />
            )}
            <DropdownMenuSeparator />
            <PageActivityPanel pageId={pageId} />
          </ActionMenuSearchSection>
        </DropdownMenuContent>
      </DropdownMenu>

      {isTemplatePage ? null : (
        <DeletePageConfirmDialog
          onConfirm={handleDelete}
          onOpenChange={setDeleteOpen}
          open={deleteOpen}
          pageId={pageId}
        />
      )}

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
