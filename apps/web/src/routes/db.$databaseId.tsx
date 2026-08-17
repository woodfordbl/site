import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useDatabasePathTargets } from "@/components/database/use-database-path-target.ts";
import { SiteShell } from "@/components/layout/site-shell.tsx";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { buildNoIndexMeta } from "@/lib/content/page-head.ts";

/**
 * Standalone database route. Database data lives ONLY in the local collections
 * (localStorage), so the loader returns a minimal shell and SSR renders
 * neutral chrome — all resolution (database lookup, not-found) happens
 * client-side in `DatabaseHubPage`. Noindex: like `/db/$/$` and `/p/$`, these
 * URLs are meaningless outside this browser.
 */
export const Route = createFileRoute("/db/$databaseId")({
  loader: () => ({ kind: "pending" as const }),
  head: () => ({ meta: buildNoIndexMeta("Database") }),
  component: DatabasePageRoute,
});

function DatabasePageRoute() {
  const { databaseId } = Route.useParams();
  const isClient = useIsClient();

  if (!isClient) {
    // Keep the app shell during SSR so hydration swaps content, not layout.
    return <SiteShell>{null}</SiteShell>;
  }

  return <DatabaseLegacyHubRedirect databaseId={databaseId} />;
}

function DatabaseLegacyHubRedirect({ databaseId }: { databaseId: string }) {
  const navigate = useNavigate();
  const { hub } = useDatabasePathTargets(databaseId);

  useEffect(() => {
    if (hub) {
      navigate({ ...hub, replace: true });
    }
  }, [hub, navigate]);

  return <SiteShell>{null}</SiteShell>;
}
