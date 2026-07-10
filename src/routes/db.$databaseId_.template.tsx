import { eq, useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { DatabaseTemplateEditorSidebar } from "@/components/database/row-page/database-template-editor-sidebar.tsx";
import { SiteShell } from "@/components/layout/site-shell.tsx";
import { PageWorkspace } from "@/components/pages/page-workspace.tsx";
import { localDatabasesCollection } from "@/db/collections/local-collections.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { buildNoIndexMeta } from "@/lib/content/page-head.ts";
import { databaseTemplatePageId } from "@/lib/databases/database-template-page.ts";
import { createEmptyRowTemplate } from "@/lib/databases/row-template-store.ts";
import { isLocallyDeletedPage } from "@/lib/schemas/local-page.ts";

/**
 * Row-template editor: the database's sentinel template page edited through
 * the normal `PageWorkspace` pipeline, exactly like the site template's
 * `/template` route. The template is created on first visit (a single empty
 * text block), so the route is always enterable; every row page renders from
 * whatever is authored here (`useRowTemplate`). Client-only — the sentinel
 * page lives in the local collections.
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

  return (
    <SiteShell>
      <PageWorkspace
        kind="user"
        page={templatePage}
        pageHasLocalDraft={true}
        sidebar={<DatabaseTemplateEditorSidebar database={database} />}
      />
    </SiteShell>
  );
}
