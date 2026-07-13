import { createFileRoute } from "@tanstack/react-router";

import { DatabasePage } from "@/components/database/database-page.tsx";
import { SiteShell } from "@/components/layout/site-shell.tsx";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { buildNoIndexMeta } from "@/lib/content/page-head.ts";

/**
 * Standalone database route. Database data lives ONLY in the local collections
 * (localStorage), so the loader returns a minimal shell and SSR renders
 * neutral chrome — all resolution (database lookup, not-found) happens
 * client-side in `DatabasePage`. Noindex: like `/db/$/$` and `/p/$`, these
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

  return <DatabasePage databaseId={databaseId} />;
}
