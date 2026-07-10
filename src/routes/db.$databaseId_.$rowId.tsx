import { createFileRoute } from "@tanstack/react-router";

import { DatabaseRowPage } from "@/components/database/row-page/database-row-page.tsx";
import { SiteShell } from "@/components/layout/site-shell.tsx";
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

  return <DatabaseRowPage databaseId={databaseId} rowId={rowId} />;
}
