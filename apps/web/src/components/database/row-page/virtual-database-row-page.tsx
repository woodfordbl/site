"use client";

import { IconDots, IconFileText, IconPencil } from "@tabler/icons-react";
import type React from "react";
import { type ReactNode, useMemo, useState } from "react";

import { CanvasBlocksReadOnly } from "@/components/canvas/page-canvas-server.tsx";
import { CustomizeRowPageDialog } from "@/components/database/row-page/customize-row-page-dialog.tsx";
import { RowPageTitleSection } from "@/components/database/row-page/row-page-title-section.tsx";
import { RowPropertiesPanel } from "@/components/database/row-page/row-properties-panel.tsx";
import {
  RowPropertiesOptionsMenu,
  useRowPageWorkspaceChrome,
} from "@/components/database/row-page/row-properties-rail.tsx";
import { RowTemplateBreadcrumb } from "@/components/database/row-page/row-template-breadcrumb.tsx";
import { useRowFormulaModel } from "@/components/database/row-page/use-row-formula-model.ts";
import { InlineFormulaPageProvider } from "@/components/editor/inline-formula-page.tsx";
import { useIsNarrowViewport } from "@/components/layout/device-layout-provider.tsx";
import {
  PageHeaderSidebarToggle,
  pageHeaderShellClassName,
} from "@/components/pages/page-header.tsx";
import { usePageSidebarChrome } from "@/components/pages/page-sidebar-chrome.tsx";
import { PageSidebarRail } from "@/components/pages/page-sidebar-rail.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { resolveDatabaseRowIcon } from "@/lib/databases/database-row-icon.ts";
import { resolveDatabaseRowPageTitle } from "@/lib/databases/database-row-page-title.ts";
import { localFormulaRelationResolver } from "@/lib/databases/formula-relations.ts";
import { instantiateTemplateBlocks } from "@/lib/databases/row-template.ts";
import type { RowTemplateSnapshot } from "@/lib/databases/row-template-store.ts";
import { pageContentTypographyProps } from "@/lib/pages/page-content-typography.ts";
import type {
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import {
  resolvePageFont,
  resolvePageFullWidth,
} from "@/lib/schemas/page-settings.ts";

/**
 * @fileoverview A row page that renders the database's template instead of
 * owning a page.
 *
 * Opening a row used to create a real page for it, seeded from the template.
 * That made merely looking at a row a write: fourteen rows glanced at became
 * fourteen stored pages, each a frozen copy that stopped tracking the template
 * — so a later template edit reached none of them, and the workspace carried
 * the weight of pages nobody had written a word in.
 *
 * So a row with no page of its own renders here: its own icon, name and
 * properties (those live on the row and stay editable), above the template's
 * blocks evaluated for this row and shown read-only. Nothing is written —
 * including for a database with no template at all, whose rows get the same
 * blank body a fresh page would have had.
 *
 * Clicking into the body is what asks for a page of its own, and
 * {@link CustomizeRowPageDialog} answers before anything is written. There is
 * no banner saying the page is read-only: a line of chrome above every row
 * page, explaining a state most readers never act on, costs more than the one
 * surprising click it would save.
 *
 * Rows that already have a page keep it; this surface never appears for them.
 */

/**
 * Anything a reader could be clicking *at* rather than clicking *into*: links
 * and buttons in the template's own content, and surfaces that read their own
 * gestures (a map's pan and zoom). Following a link should follow the link.
 */
const INTERACTIVE_SELECTOR =
  "input, textarea, [contenteditable], button, a, [role='button'], [data-canvas-pointer-surface]";

/** The row's own editable metadata, which is never a request to edit the body. */
const ROW_HEADER_SELECTOR = "[data-row-page-header]";

/** Blocks are already instantiated, so tokens print — but bound blocks still resolve live. */
function useTemplateBody(
  database: LocalDatabase,
  row: LocalDatabaseRow,
  template: RowTemplateSnapshot | null
) {
  const templateBlocks = template?.blocks;

  return useMemo(
    () =>
      instantiateTemplateBlocks(templateBlocks, database.fields, row.values, {
        now: () => new Date(),
        relations: localFormulaRelationResolver(),
      }),
    [database.fields, row.values, templateBlocks]
  );
}

/** Whether `target` is a click into the body rather than at something in it. */
function isEditIntent(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return !(
    target.closest(INTERACTIVE_SELECTOR) || target.closest(ROW_HEADER_SELECTOR)
  );
}

export interface VirtualDatabaseRowPageProps {
  database: LocalDatabase;
  /** Materializes the page and hands the row its own body. */
  onCustomize: () => void;
  /** Absent when the template editor is unreachable (no host page yet). */
  onEditTemplate?: () => void;
  row: LocalDatabaseRow;
  /** Null when the database has no custom template — the body is then blank. */
  template: RowTemplateSnapshot | null;
}

export function VirtualDatabaseRowPage({
  database,
  onCustomize,
  onEditTemplate,
  row,
  template,
}: VirtualDatabaseRowPageProps): ReactNode {
  const isNarrowViewport = useIsNarrowViewport();
  const { isCollapsed } = usePageSidebarChrome();
  const showSidebarRail = !(isNarrowViewport || isCollapsed);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const chrome = useRowPageWorkspaceChrome(database, {
    propertiesPanel: <RowPropertiesPanel database={database} row={row} />,
  });
  const inlineFormulaModel = useRowFormulaModel(database, row);
  const blocks = useTemplateBody(database, row, template);
  const displayTitle = resolveDatabaseRowPageTitle(database, row);
  const displayIcon = resolveDatabaseRowIcon(row, template?.icon);

  const requestEdit = (event: React.SyntheticEvent) => {
    if (!isEditIntent(event.target)) {
      return;
    }
    event.preventDefault();
    setCustomizeOpen(true);
  };

  const canvasRegion = (
    // The body is the affordance: clicking where you would start typing is
    // what asks for a page, and the dialog answers before anything is written.
    // It cannot be a <button> — it contains the row's own editable title and
    // properties — and it is a shortcut, not the only route: the header's ⋯
    // menu carries the same action for keyboard and screen-reader users.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: click-to-edit shortcut over read-only blocks
    // biome-ignore lint/a11y/noStaticElementInteractions: cannot take a role — it wraps the row's own title input
    // biome-ignore lint/a11y/useKeyWithClickEvents: the header menu is the keyboard path
    <div
      {...pageContentTypographyProps({
        font: resolvePageFont(template?.font),
        textScale: template?.textScale,
      })}
      className="flex min-h-0 min-w-0 flex-1 flex-col max-md:flex-none max-md:overflow-visible md:overflow-hidden"
      onClick={requestEdit}
    >
      <InlineFormulaPageProvider
        modelOverride={inlineFormulaModel}
        pageId={row.id}
        title={displayTitle}
      >
        <CanvasBlocksReadOnly
          blocks={blocks}
          fullWidth={resolvePageFullWidth(template?.fullWidth)}
          isNarrowViewport={isNarrowViewport}
          // `view` mode, not `edit`: read-only markup with no contentEditable,
          // so a click into the body cannot start an edit the row cannot keep.
          mode="view"
          pageId={row.id}
          titleSlot={
            <div data-row-page-header="">
              <RowPageTitleSection
                database={database}
                icon={template?.icon}
                propertiesExtra={
                  <RowPropertiesOptionsMenu
                    className="hover-reveal"
                    database={database}
                  />
                }
                row={row}
                showProperties={!chrome.panelMode}
              />
            </div>
          }
          topLevelBlockAlign={chrome.topLevelBlockAlign}
        />
      </InlineFormulaPageProvider>
    </div>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col max-md:h-auto md:h-full">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col max-md:flex-none">
        {showSidebarRail ? <PageSidebarRail /> : null}
        <div
          className="relative flex min-h-0 min-w-0 flex-1 flex-col border border-border bg-background max-md:flex-none max-md:overflow-visible max-md:border-0 md:overflow-hidden md:rounded-xl"
          data-page-main-panel=""
        >
          <header className={pageHeaderShellClassName}>
            <PageHeaderSidebarToggle />
            <RowTemplateBreadcrumb
              databaseId={database.id}
              icon={displayIcon}
              title={displayTitle}
            />
            <DropdownMenu>
              <DropdownMenuTrigger
                nativeButton
                render={
                  <Button
                    aria-label="Page settings and actions"
                    className="ml-auto shrink-0 text-muted-foreground"
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  />
                }
              >
                <IconDots aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setCustomizeOpen(true);
                  }}
                >
                  <IconPencil />
                  Edit this page
                </DropdownMenuItem>
                {onEditTemplate ? (
                  <DropdownMenuItem onClick={onEditTemplate}>
                    <IconFileText />
                    Edit template
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          {chrome.contentWrapper
            ? chrome.contentWrapper(canvasRegion)
            : canvasRegion}
        </div>
      </div>
      <CustomizeRowPageDialog
        databaseName={database.name}
        hasTemplate={template !== null}
        onCustomize={() => {
          setCustomizeOpen(false);
          onCustomize();
        }}
        onEditTemplate={
          onEditTemplate
            ? () => {
                setCustomizeOpen(false);
                onEditTemplate();
              }
            : undefined
        }
        onOpenChange={setCustomizeOpen}
        open={customizeOpen}
      />
    </div>
  );
}
