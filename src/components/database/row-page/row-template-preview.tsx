import { IconExternalLink } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useMemo } from "react";
import { PageCanvas } from "@/components/canvas/page-canvas.tsx";
import { RowPageTitleSection } from "@/components/database/row-page/row-page-title-section.tsx";
import { RowPropertiesPanel } from "@/components/database/row-page/row-properties-panel.tsx";
import {
  RowPropertiesOptionsMenu,
  useRowPageWorkspaceChrome,
} from "@/components/database/row-page/row-properties-rail.tsx";
import { RowTemplateBreadcrumb } from "@/components/database/row-page/row-template-breadcrumb.tsx";
import { useDatabasePathTargets } from "@/components/database/use-database-path-target.ts";
import {
  PageHeaderSidebarToggle,
  pageHeaderShellClassName,
} from "@/components/pages/page-header.tsx";
import { usePageSidebarChrome } from "@/components/pages/page-sidebar-chrome.tsx";
import { PageSidebarRail } from "@/components/pages/page-sidebar-rail.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useIsNarrowViewport } from "@/hooks/device-layout.ts";
import { useRowTemplate } from "@/hooks/use-row-template.ts";
import { resolveDatabaseRowIcon } from "@/lib/databases/database-row-icon.ts";
import { resolveDatabaseRowPageTitle } from "@/lib/databases/database-row-page-title.ts";
import type { InlineFormulaPageModel } from "@/lib/databases/page-formula-fields.ts";
import { pageContentTypographyProps } from "@/lib/pages/page-content-typography.ts";
import type {
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";
import { resolvePageFont } from "@/lib/schemas/page-settings.ts";

/**
 * Mixed editor for one template-backed row: icon, name, and properties write
 * to the row, while the canvas writes to the shared `db-template:…` page.
 * Materialized rows never mount this surface — their separate body must be
 * cleared from the sidebar first.
 */
export function RowTemplatePreviewBody({
  database,
  row,
  templatePage,
}: {
  database: LocalDatabase;
  row: LocalDatabaseRow;
  templatePage: LocalPage;
}): ReactNode {
  const isNarrowViewport = useIsNarrowViewport();
  const { isCollapsed } = usePageSidebarChrome();
  const showSidebarRail = !(isNarrowViewport || isCollapsed);
  const { row: rowTarget } = useDatabasePathTargets(database.id, row);
  const chrome = useRowPageWorkspaceChrome(database, {
    propertiesPanel: <RowPropertiesPanel database={database} row={row} />,
  });

  const template = useRowTemplate(database.id);
  const displayTitle = resolveDatabaseRowPageTitle(database, row);
  const displayIcon = resolveDatabaseRowIcon(row, template?.icon);

  const inlineFormulaModel = useMemo<InlineFormulaPageModel>(
    () => ({
      cellValues: row.values,
      databaseFields: database.fields,
      page: {
        createdAt: row.createdAt,
        title: displayTitle,
        updatedAt: row.updatedAt,
      },
      primaryFieldId: database.primaryFieldId,
    }),
    [
      database.fields,
      database.primaryFieldId,
      displayTitle,
      row.createdAt,
      row.updatedAt,
      row.values,
    ]
  );

  const canvasRegion = (
    <div
      {...pageContentTypographyProps({
        font: resolvePageFont(template?.font),
        textScale: undefined,
      })}
      className="flex min-h-0 min-w-0 flex-1 flex-col max-md:flex-none max-md:overflow-visible md:overflow-hidden"
    >
      <PageCanvas
        fullWidth={false}
        inlineFormulaModel={inlineFormulaModel}
        isNarrowViewport={isNarrowViewport}
        pageHasLocalDraft={true}
        serverPage={{
          blocks: [],
          icon: templatePage.icon,
          id: templatePage.id,
          parentId: templatePage.parentId ?? null,
          sidebarOrder: templatePage.sidebarOrder,
          slug: templatePage.slug,
          title: templatePage.title,
        }}
        titleSlot={
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
        }
        topLevelBlockAlign={chrome.topLevelBlockAlign}
      />
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
            {rowTarget ? (
              <Button
                className="shrink-0 text-muted-foreground"
                nativeButton={false}
                render={<Link {...rowTarget} />}
                size="xs"
                variant="ghost"
              >
                <IconExternalLink />
                Open
              </Button>
            ) : null}
          </header>
          {chrome.contentWrapper
            ? chrome.contentWrapper(canvasRegion)
            : canvasRegion}
        </div>
      </div>
    </div>
  );
}
