import {
  IconChevronLeft,
  IconEraser,
  IconEye,
  IconPencil,
  IconRefresh,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { ClearRowPagesConfirmDialog } from "@/components/database/row-page/clear-row-pages-confirm-dialog.tsx";
import { useDatabasePathTargets } from "@/components/database/use-database-path-target.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import {
  clearDatabaseRowPage,
  clearDatabaseRowPages,
  isDatabaseRowPageMaterialized,
  listMaterializedDatabaseRowPageIds,
} from "@/lib/databases/clear-database-row-pages.ts";
import { resolveDatabaseRowPageTitle } from "@/lib/databases/database-row-page-title.ts";
import type {
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import { appToast } from "@/lib/toast/app-toast.ts";
import { TOAST_ID_CLEAR_ROW_PAGES } from "@/lib/toast/toast-ids.ts";

/** Rows offered in the preview picker — enough to sample, never the world. */
const PREVIEW_ROW_LIMIT = 12;

function clearRowPagesLabel(materializedCount: number): string {
  if (materializedCount === 0) {
    return "No row pages to clear";
  }
  if (materializedCount === 1) {
    return "Clear 1 row page…";
  }
  return `Clear ${materializedCount} row pages…`;
}

export interface DatabaseTemplateEditorSidebarProps {
  database: LocalDatabase;
  /** Row currently previewed, or null while editing. */
  previewRowId?: string | null;
  /** Preview rows (already capped by the route); empty hides the section. */
  previewRows?: LocalDatabaseRow[];
  setPreviewRowId?: (rowId: string | null) => void;
}

/**
 * Sidebar for the row-template editor: back to the database, a live preview
 * picker (same evaluation as opening a row, without materializing), and
 * **Clear row pages** so already-seeded pages re-seed from this template.
 */
export function DatabaseTemplateEditorSidebar({
  database,
  previewRowId = null,
  previewRows = [],
  setPreviewRowId,
}: DatabaseTemplateEditorSidebarProps) {
  const { hub: hubTarget } = useDatabasePathTargets(database.id);
  const { pages } = useMergedPageListItems();
  const dispatch = usePageDispatch(pages);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearRow, setClearRow] = useState<LocalDatabaseRow | null>(null);

  const materializedCount = useMemo(
    () => listMaterializedDatabaseRowPageIds(database.id, pages).length,
    [database.id, pages]
  );

  const handleClearConfirm = () => {
    const cleared = clearDatabaseRowPages({
      databaseId: database.id,
      dispatchPage: dispatch,
      pages,
    });
    setClearOpen(false);
    // Leaving preview after a clear avoids showing a stale in-editor shell
    // that no longer matches what a fresh open would seed.
    setPreviewRowId?.(null);
    const toastMessage =
      cleared === 1
        ? "Cleared 1 row page. It will re-seed from this template when opened."
        : `Cleared ${cleared} row pages. They will re-seed from this template when opened.`;
    appToast.success(toastMessage, { id: TOAST_ID_CLEAR_ROW_PAGES });
  };

  const handleClearRowConfirm = () => {
    if (!clearRow) {
      return;
    }
    const cleared = clearDatabaseRowPage({
      dispatchPage: dispatch,
      pages,
      row: clearRow,
    });
    setClearRow(null);
    if (cleared) {
      appToast.success(
        `Cleared content for ${resolveDatabaseRowPageTitle(database, clearRow)}. It will re-seed from this template when opened.`,
        { id: TOAST_ID_CLEAR_ROW_PAGES }
      );
    }
  };

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground"
      data-side="left"
      data-sidebar="sidebar"
      data-state="expanded"
      id="page-sidebar"
    >
      <SidebarContent>
        <SidebarGroup className="gap-y-px">
          <SidebarMenu className="w-fit">
            <SidebarMenuItem className="w-fit">
              <SidebarMenuButton
                className="w-fit"
                render={hubTarget ? <Link {...hubTarget} /> : <span />}
              >
                <IconChevronLeft />
                <span className="min-w-0 truncate">
                  Back to {database.name}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <SidebarGroupContent>
            <div className="flex flex-col gap-1 px-2 py-1.5 text-sidebar-foreground/60 text-sm">
              <p>Edit this page like a row. New opens use it automatically.</p>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
        {setPreviewRowId && previewRows.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupLabel>Live preview</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={previewRowId === null}
                    onClick={() => {
                      setPreviewRowId(null);
                    }}
                  >
                    <IconPencil />
                    <span>Editing template</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {previewRows.map((row) => {
                  const materialized = isDatabaseRowPageMaterialized(
                    row,
                    pages
                  );
                  return (
                    <SidebarMenuItem key={row.id}>
                      <SidebarMenuButton
                        className={materialized ? "pr-7" : undefined}
                        disabled={materialized}
                        isActive={!materialized && previewRowId === row.id}
                        onClick={() => {
                          setPreviewRowId(row.id);
                        }}
                      >
                        <IconEye />
                        <span className="min-w-0 truncate">
                          {resolveDatabaseRowPageTitle(database, row)}
                        </span>
                      </SidebarMenuButton>
                      {materialized ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <SidebarMenuAction
                                aria-label={`Clear content for ${resolveDatabaseRowPageTitle(database, row)}`}
                                className="hover:text-destructive"
                                onClick={() => {
                                  setClearRow(row);
                                }}
                              >
                                <IconEraser />
                              </SidebarMenuAction>
                            }
                          />
                          <TooltipContent>Clear content</TooltipContent>
                        </Tooltip>
                      ) : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
        <SidebarGroup>
          <SidebarGroupLabel>Apply template</SidebarGroupLabel>
          <SidebarGroupContent className="flex flex-col gap-2 px-2">
            <p className="text-sidebar-foreground/60 text-xs">
              Already-opened row pages keep their old body until you clear them.
            </p>
            <Button
              className="w-full justify-start"
              disabled={materializedCount === 0}
              onClick={() => {
                setClearOpen(true);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <IconRefresh />
              {clearRowPagesLabel(materializedCount)}
            </Button>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <ClearRowPagesConfirmDialog
        onConfirm={handleClearConfirm}
        onOpenChange={setClearOpen}
        open={clearOpen}
        pageCount={materializedCount}
      />
      <ClearRowPagesConfirmDialog
        onConfirm={handleClearRowConfirm}
        onOpenChange={(open) => {
          if (!open) {
            setClearRow(null);
          }
        }}
        open={clearRow !== null}
        pageCount={1}
      />
    </div>
  );
}

export { PREVIEW_ROW_LIMIT };
