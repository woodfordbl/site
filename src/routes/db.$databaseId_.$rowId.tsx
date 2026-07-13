import { eq, useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useDatabasePathTargets } from "@/components/database/use-database-path-target.ts";
import { SiteShell } from "@/components/layout/site-shell.tsx";
import { localDatabaseRowsCollection } from "@/db/collections/local-collections.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { buildNoIndexMeta } from "@/lib/content/page-head.ts";

/**
 * Virtual row page route. Row and database data live ONLY in the local
 * collections (localStorage), so the loader returns a minimal shell and SSR
 * renders neutral chrome — all resolution (database + row lookup, linked-page
 * redirect, not-found) happens client-side in `DatabaseRowPage`. Noindex:
 * like `/p/$`, these URLs are meaningless outside this browser.
 */
export const Route = createFileRoute("/db/$databaseId_/$rowId")({
  loader: () => ({ kind: "pending" as const }),
  head: () => ({ meta: buildNoIndexMeta("Database") }),
  component: DatabaseRowPageRoute,
});

function DatabaseRowPageRoute() {
  const { databaseId, rowId } = Route.useParams();
  const isClient = useIsClient();

  if (!isClient) {
    // Keep the app shell during SSR so hydration swaps content, not layout.
    return <SiteShell>{null}</SiteShell>;
  }

  return <DatabaseLegacyRowRedirect databaseId={databaseId} rowId={rowId} />;
}

function DatabaseLegacyRowRedirect({
  databaseId,
  rowId,
}: {
  databaseId: string;
  rowId: string;
}) {
  const navigate = useNavigate();
  const { data: rows = [] } = useLiveQuery(
    (query) =>
      query
        .from({ row: localDatabaseRowsCollection })
        .where(({ row }) => eq(row.id, rowId)),
    [rowId]
  );
  const row = rows.find((entry) => entry.databaseId === databaseId);
  const { row: target } = useDatabasePathTargets(databaseId, row);

  useEffect(() => {
    if (target) {
      navigate({ ...target, replace: true });
    }
  }, [navigate, target]);

  return <SiteShell>{null}</SiteShell>;
}
