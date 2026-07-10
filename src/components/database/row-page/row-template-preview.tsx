import { IconEye } from "@tabler/icons-react";
import { type ReactNode, useMemo } from "react";
import { CanvasBlocksReadOnly } from "@/components/canvas/page-canvas-server.tsx";
import { RowPageTitleSection } from "@/components/database/row-page/database-row-page.tsx";
import { RowPropertiesPanel } from "@/components/database/row-page/row-properties-panel.tsx";
import {
  RowPropertiesRailExpandButton,
  RowPropertiesRailLayout,
  useRowPropertiesRail,
} from "@/components/database/row-page/row-properties-rail.tsx";
import { usePageSidebarChrome } from "@/components/pages/page-sidebar-chrome.tsx";
import { PageSidebarRail } from "@/components/pages/page-sidebar-rail.tsx";
import { useIsNarrowViewport } from "@/hooks/device-layout.ts";
import { useRowTemplate } from "@/hooks/use-row-template.ts";
import { resolveDatabaseRowPageTitle } from "@/lib/databases/materialize-row-page.ts";
import { instantiateTemplateBlocks } from "@/lib/databases/row-template.ts";
import { pageContentTypographyProps } from "@/lib/pages/page-content-typography.ts";
import type {
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import { resolvePageFont } from "@/lib/schemas/page-settings.ts";

/**
 * Preview-as-row for the template editor: renders EXACTLY what the virtual
 * row page renders for the chosen row — same title/properties section, same
 * per-render token evaluation, same inherited icon/font — inside the editor's
 * shell, topped with a slim "Previewing as" bar; the sidebar's "Editing
 * template" item returns to the editor. Properties edit the real row (they're
 * the row's live values, same as the row page); the body is read-only and
 * never materializes.
 */
export function RowTemplatePreviewBody({
  database,
  row,
}: {
  database: LocalDatabase;
  row: LocalDatabaseRow;
}): ReactNode {
  const isNarrowViewport = useIsNarrowViewport();
  const { isCollapsed } = usePageSidebarChrome();
  const showSidebarRail = !(isNarrowViewport || isCollapsed);
  const rail = useRowPropertiesRail();

  const template = useRowTemplate(database.id);
  const displayTitle = resolveDatabaseRowPageTitle(database, row);
  const templateBlocks = useMemo(
    () =>
      instantiateTemplateBlocks(template?.blocks, database.fields, row.values, {
        now: () => new Date(),
      }),
    [template?.blocks, database.fields, row.values]
  );

  // The scroll region below the full-width "Previewing as" bar — the part
  // the properties rail splits when expanded.
  const content = (
    <div
      {...pageContentTypographyProps({
        font: resolvePageFont(template?.font),
        textScale: undefined,
      })}
      className="flex min-h-0 min-w-0 flex-1 flex-col max-md:flex-none max-md:overflow-visible md:overflow-hidden"
    >
      <CanvasBlocksReadOnly
        blocks={templateBlocks}
        isNarrowViewport={isNarrowViewport}
        mode="view"
        pageId={`db-template-preview:${row.id}`}
        titleSlot={
          <RowPageTitleSection
            database={database}
            displayTitle={displayTitle}
            icon={template?.icon}
            propertiesExtra={
              rail.available ? (
                <RowPropertiesRailExpandButton
                  onExpand={() => {
                    rail.setExpanded(true);
                  }}
                />
              ) : undefined
            }
            row={row}
            showProperties={!rail.expanded}
          />
        }
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
          <div className="flex h-10 shrink-0 items-center gap-2 border-sidebar-border border-b bg-muted/40 px-3 text-muted-foreground text-sm">
            <IconEye aria-hidden className="size-4 shrink-0" />
            <span className="min-w-0 truncate">
              Previewing as{" "}
              <span className="text-foreground">{displayTitle}</span>
            </span>
          </div>
          {rail.expanded ? (
            <RowPropertiesRailLayout
              onCollapse={() => {
                rail.setExpanded(false);
              }}
              panel={<RowPropertiesPanel database={database} row={row} />}
            >
              {content}
            </RowPropertiesRailLayout>
          ) : (
            content
          )}
        </div>
      </div>
    </div>
  );
}
