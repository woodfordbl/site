import { eq, useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  DatabaseTemplateEditorSidebar,
  PREVIEW_ROW_LIMIT,
} from "@/components/database/row-page/database-template-editor-sidebar.tsx";
import {
  RowPropertiesOptionsMenu,
  useRowPageWorkspaceChrome,
} from "@/components/database/row-page/row-properties-rail.tsx";
import { RowTemplateBreadcrumb } from "@/components/database/row-page/row-template-breadcrumb.tsx";
import { RowTemplatePreviewBody } from "@/components/database/row-page/row-template-preview.tsx";
import {
  hasRowTemplateDefaultFields,
  RowTemplateDefaultsList,
  RowTemplateTitleSection,
} from "@/components/database/row-page/row-template-title-section.tsx";
import { SiteShell } from "@/components/layout/site-shell.tsx";
import { PageSidebarChromeProvider } from "@/components/pages/page-sidebar-chrome.tsx";
import { PageWorkspace } from "@/components/pages/page-workspace.tsx";
import {
  localDatabaseRowsCollection,
  localDatabasesCollection,
} from "@/db/collections/local-collections.ts";
import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { isDatabaseRowPageMaterialized } from "@/lib/databases/clear-database-row-pages.ts";
import { databaseTemplatePageId } from "@/lib/databases/database-template-page.ts";
import { createEmptyRowTemplate } from "@/lib/databases/row-template-store.ts";
import type { LocalDatabaseRow } from "@/lib/schemas/database.ts";
import { isLocallyDeletedPage } from "@/lib/schemas/local-page.ts";

/**
 * Row-template editor: the database's sentinel template page edited through
 * the normal `PageWorkspace` pipeline like a real row page (icon + defaults
 * properties band + canvas), with a sidebar **Live preview** picker that swaps
 * the editor for the chosen row's evaluated page and **Clear row pages** so
 * already-materialized pages re-seed from this template. Created on first
 * visit (a single empty text block). Client-only — local collections only.
 */

/** Matches the `{host}/{db}/template` URL segment the editor is reached by. */
const ROW_TEMPLATE_CRUMB_TITLE = "Template";

/** First rows in manual order — the preview picker's sample. */
function pickPreviewRows(rows: LocalDatabaseRow[]): LocalDatabaseRow[] {
  return [...rows]
    .sort(
      (left, right) =>
        (left.order ?? Number.POSITIVE_INFINITY) -
          (right.order ?? Number.POSITIVE_INFINITY) ||
        left.createdAt.localeCompare(right.createdAt)
    )
    .slice(0, PREVIEW_ROW_LIMIT);
}

export function DatabaseTemplateEditorClient({
  databaseId,
}: {
  databaseId: string;
}) {
  const navigate = useNavigate();
  const { data: databases = [], isReady } = useLiveQuery(
    (query) =>
      query
        .from({ database: localDatabasesCollection })
        .where(({ database }) => eq(database.id, databaseId)),
    [databaseId]
  );
  const database = databases[0];

  const { data: rows = [] } = useLiveQuery(
    (query) =>
      query
        .from({ row: localDatabaseRowsCollection })
        .where(({ row }) => eq(row.databaseId, databaseId)),
    [databaseId]
  );
  const previewRows = useMemo(() => pickPreviewRows(rows), [rows]);
  const { pages } = useMergedPageListItems();
  const chrome = useRowPageWorkspaceChrome(database, {
    hasProperties: database ? hasRowTemplateDefaultFields(database) : false,
    propertiesPanel: database ? (
      <RowTemplateDefaultsList database={database} />
    ) : null,
  });

  const [previewRowId, setPreviewRowId] = useState<string | null>(null);
  // A deleted/out-of-sample or materialized row silently falls back to
  // template editing. Materialized rows own a separate body and must be
  // cleared from the sidebar before they can become a mixed preview again.
  const previewCandidate = previewRowId
    ? previewRows.find((row) => row.id === previewRowId)
    : undefined;
  const previewRow =
    previewCandidate && !isDatabaseRowPageMaterialized(previewCandidate, pages)
      ? previewCandidate
      : undefined;

  useEffect(() => {
    if (previewRowId !== null && previewRow === undefined) {
      setPreviewRowId(null);
    }
  }, [previewRow, previewRowId]);

  const templateRecord = useLocalPageById(databaseTemplatePageId(databaseId));
  const templatePage =
    templateRecord && !isLocallyDeletedPage(templateRecord)
      ? templateRecord
      : null;

  // First visit (or after a reset) creates the template so the editor always
  // has a real page to edit.
  useEffect(() => {
    if (isReady && database && !templatePage) {
      createEmptyRowTemplate(databaseId);
    }
  }, [isReady, database, templatePage, databaseId]);

  // Unknown database: bounce home rather than editing an orphan template.
  useEffect(() => {
    if (isReady && !database) {
      navigate({ replace: true, to: "/" });
    }
  }, [isReady, database, navigate]);

  if (!(database && templatePage)) {
    return <SiteShell>{null}</SiteShell>;
  }

  const sidebar = (
    <DatabaseTemplateEditorSidebar
      database={database}
      previewRowId={previewRowId}
      previewRows={previewRows}
      setPreviewRowId={setPreviewRowId}
    />
  );

  const workspace = (
    <PageWorkspace
      breadcrumbSlot={
        <RowTemplateBreadcrumb
          databaseId={database.id}
          icon={templatePage.icon}
          title={ROW_TEMPLATE_CRUMB_TITLE}
        />
      }
      contentWrapper={chrome.contentWrapper}
      kind="user"
      page={templatePage}
      pageHasLocalDraft={true}
      titleSlot={
        <RowTemplateTitleSection
          database={database}
          propertiesExtra={
            <RowPropertiesOptionsMenu
              className="hover-reveal"
              database={database}
            />
          }
          showProperties={!chrome.panelMode}
          templatePage={templatePage}
        />
      }
      topLevelBlockAlign={chrome.topLevelBlockAlign}
    />
  );

  // ONE sidebar shell across both modes — swapping edit ↔ preview replaces
  // only the main panel, so the sidebar keeps its pin/width state
  // (`PageWorkspace` detects the existing provider and doesn't nest its own).
  return (
    <SiteShell>
      <PageSidebarChromeProvider sidebar={sidebar}>
        {previewRow ? (
          <RowTemplatePreviewBody
            database={database}
            row={previewRow}
            templatePage={templatePage}
          />
        ) : (
          workspace
        )}
      </PageSidebarChromeProvider>
    </SiteShell>
  );
}
