"use client";

import { IconFileText, IconPencil } from "@tabler/icons-react";
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
 * blocks evaluated for this row and shown read-only. Nothing is written.
 * Asking to edit the body is what materializes the page, through
 * {@link CustomizeRowPageDialog} so the trade is stated before it is made.
 *
 * Rows that already have a page keep it; this surface never appears for them.
 */

/** Blocks are already instantiated, so tokens print — but bound blocks still resolve live. */
function useTemplateBody(
  database: LocalDatabase,
  row: LocalDatabaseRow,
  template: RowTemplateSnapshot
) {
  return useMemo(
    () =>
      instantiateTemplateBlocks(template.blocks, database.fields, row.values, {
        now: () => new Date(),
        relations: localFormulaRelationResolver(),
      }),
    [database.fields, row.values, template.blocks]
  );
}

/**
 * The line that says this page is not its own. Sits between the properties and
 * the body, where the body begins: it explains what follows, and it is the
 * only place the two ways to edit are offered.
 */
function TemplateFollowNotice({
  databaseName,
  onCustomize,
  onEditTemplate,
}: {
  databaseName: string;
  onCustomize: () => void;
  onEditTemplate?: () => void;
}): ReactNode {
  return (
    <div className="hover-reveal-group flex flex-wrap items-center gap-x-2 gap-y-1 pt-6 text-muted-foreground text-xs">
      <span>Follows the {databaseName} template.</span>
      <Button
        className="h-6 px-2 text-xs"
        onClick={onCustomize}
        size="sm"
        variant="ghost"
      >
        <IconPencil />
        Edit this page
      </Button>
      {onEditTemplate ? (
        <Button
          className="h-6 px-2 text-xs"
          onClick={onEditTemplate}
          size="sm"
          variant="ghost"
        >
          <IconFileText />
          Edit template
        </Button>
      ) : null}
    </div>
  );
}

export interface VirtualDatabaseRowPageProps {
  database: LocalDatabase;
  /** Materializes the page and hands the row its own body. */
  onCustomize: () => void;
  /** Absent when the template editor is unreachable (no host page yet). */
  onEditTemplate?: () => void;
  row: LocalDatabaseRow;
  template: RowTemplateSnapshot;
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
  const displayIcon = resolveDatabaseRowIcon(row, template.icon);

  const canvasRegion = (
    <div
      {...pageContentTypographyProps({
        font: resolvePageFont(template.font),
        textScale: template.textScale,
      })}
      className="flex min-h-0 min-w-0 flex-1 flex-col max-md:flex-none max-md:overflow-visible md:overflow-hidden"
    >
      <InlineFormulaPageProvider
        modelOverride={inlineFormulaModel}
        pageId={row.id}
        title={displayTitle}
      >
        <CanvasBlocksReadOnly
          blocks={blocks}
          fullWidth={resolvePageFullWidth(template.fullWidth)}
          isNarrowViewport={isNarrowViewport}
          // `view` mode, not `edit`: read-only markup with no contentEditable,
          // so a click into the body cannot start an edit the row cannot keep.
          mode="view"
          pageId={row.id}
          titleSlot={
            <>
              <RowPageTitleSection
                database={database}
                icon={template.icon}
                propertiesExtra={
                  <RowPropertiesOptionsMenu
                    className="hover-reveal"
                    database={database}
                  />
                }
                row={row}
                showProperties={!chrome.panelMode}
              />
              <TemplateFollowNotice
                databaseName={database.name}
                onCustomize={() => setCustomizeOpen(true)}
                onEditTemplate={onEditTemplate}
              />
            </>
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
          </header>
          {chrome.contentWrapper
            ? chrome.contentWrapper(canvasRegion)
            : canvasRegion}
        </div>
      </div>
      <CustomizeRowPageDialog
        databaseName={database.name}
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
