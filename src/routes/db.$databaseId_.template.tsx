import { eq, useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import {
  DatabaseTemplateEditorSidebar,
  PREVIEW_ROW_LIMIT,
} from "@/components/database/row-page/database-template-editor-sidebar.tsx";
import {
  RowPropertiesRailExpandButton,
  RowPropertiesRailLayout,
  useRowPropertiesRail,
} from "@/components/database/row-page/row-properties-rail.tsx";
import { RowTemplatePreviewBody } from "@/components/database/row-page/row-template-preview.tsx";
import {
  RowTemplateDefaultsList,
  RowTemplateTitleSection,
} from "@/components/database/row-page/row-template-title-section.tsx";
import { RowTemplateTokenAutocomplete } from "@/components/database/row-page/row-template-token-autocomplete.tsx";
import { SiteShell } from "@/components/layout/site-shell.tsx";
import { PageSidebarChromeProvider } from "@/components/pages/page-sidebar-chrome.tsx";
import { PageWorkspace } from "@/components/pages/page-workspace.tsx";
import {
  localDatabaseRowsCollection,
  localDatabasesCollection,
} from "@/db/collections/local-collections.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { buildNoIndexMeta } from "@/lib/content/page-head.ts";
import { databaseTemplatePageId } from "@/lib/databases/database-template-page.ts";
import { createEmptyRowTemplate } from "@/lib/databases/row-template-store.ts";
import type { LocalDatabaseRow } from "@/lib/schemas/database.ts";
import { isLocallyDeletedPage } from "@/lib/schemas/local-page.ts";

/**
 * Row-template editor: the database's sentinel template page edited through
 * the normal `PageWorkspace` pipeline, exactly like the site template's
 * `/template` route, with a pinned header (locked primary-field title +
 * properties reference) and a sidebar **Preview as row** picker that swaps
 * the editor for the chosen row's live-rendered page. The template is created
 * on first visit (a single empty text block), so the route is always
 * enterable; every row page renders from whatever is authored here
 * (`useRowTemplate`). Client-only — everything lives in local collections.
 */
export const Route = createFileRoute("/db/$databaseId_/template")({
  loader: () => ({ kind: "pending" as const }),
  head: () => ({ meta: buildNoIndexMeta() }),
  component: DatabaseTemplateEditorRoute,
});

function DatabaseTemplateEditorRoute() {
  const { databaseId } = Route.useParams();
  const isClient = useIsClient();

  if (!isClient) {
    // Keep the app shell during SSR so hydration swaps content, not layout.
    return <SiteShell>{null}</SiteShell>;
  }

  return <DatabaseTemplateEditorClient databaseId={databaseId} />;
}

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

function DatabaseTemplateEditorClient({ databaseId }: { databaseId: string }) {
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
  const rail = useRowPropertiesRail();

  const [previewRowId, setPreviewRowId] = useState<string | null>(null);
  // A deleted/out-of-sample row silently falls back to editing.
  const previewRow = previewRowId
    ? previewRows.find((row) => row.id === previewRowId)
    : undefined;

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
      contentWrapper={
        rail.expanded
          ? (content) => (
              <RowPropertiesRailLayout
                onCollapse={() => {
                  rail.setExpanded(false);
                }}
                panel={<RowTemplateDefaultsList database={database} />}
              >
                {content}
              </RowPropertiesRailLayout>
            )
          : undefined
      }
      kind="user"
      page={templatePage}
      pageHasLocalDraft={true}
      titleSlot={
        <RowTemplateTitleSection
          database={database}
          propertiesExtra={
            rail.available ? (
              <RowPropertiesRailExpandButton
                onExpand={() => {
                  rail.setExpanded(true);
                }}
              />
            ) : undefined
          }
          showProperties={!rail.expanded}
          templatePage={templatePage}
        />
      }
    />
  );

  // ONE sidebar shell across both modes — swapping edit ↔ preview replaces
  // only the main panel, so the sidebar keeps its pin/width state
  // (`PageWorkspace` detects the existing provider and doesn't nest its own).
  return (
    <SiteShell>
      <PageSidebarChromeProvider sidebar={sidebar}>
        {previewRow ? (
          <RowTemplatePreviewBody database={database} row={previewRow} />
        ) : (
          workspace
        )}
      </PageSidebarChromeProvider>
      {previewRow ? null : <RowTemplateTokenAutocomplete database={database} />}
    </SiteShell>
  );
}
