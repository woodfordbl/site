import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useDatabasePathTargets } from "@/components/database/use-database-path-target.ts";
import { SiteShell } from "@/components/layout/site-shell.tsx";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { buildNoIndexMeta } from "@/lib/content/page-head.ts";

/**
 * Legacy `/db/$databaseId/template` → host-relative `{host}/{db}/template`.
 * The editor UI lives in
 * `components/database/row-page/database-template-editor.tsx` and is mounted
 * from slug-path dispatch (`DatabaseSlugPathPage`).
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

  return <DatabaseLegacyTemplateRedirect databaseId={databaseId} />;
}

function DatabaseLegacyTemplateRedirect({
  databaseId,
}: {
  databaseId: string;
}) {
  const navigate = useNavigate();
  const { template } = useDatabasePathTargets(databaseId);

  useEffect(() => {
    if (template) {
      navigate({ ...template, replace: true });
    }
  }, [navigate, template]);

  return <SiteShell>{null}</SiteShell>;
}
