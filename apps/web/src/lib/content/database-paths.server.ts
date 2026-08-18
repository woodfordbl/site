import { getShippedDatabases } from "@/lib/content/database-store.server.ts";
import { shippedPageSummaries } from "@/lib/content/page-summaries.server.ts";
import { isDatabasePathPrefix } from "@/lib/databases/database-page-paths.ts";

/**
 * @fileoverview Server-side answer to "could this slug belong to a database?"
 *
 * Databases are local-first: their hub, row and template pages exist only in
 * the visitor's browser, so the page catalog a server render can see says
 * nothing about them. But the *shape* of those paths is knowable from shipped
 * content alone — `content/databases/*.json` names each database, and the
 * shipped pages that embed it carry `databaseIds`, which is exactly what the
 * host scan reads. That fixes the hub prefix `{host}/{db}` a database owns.
 *
 * Rows stay unknowable here (a visitor's own rows never reached the server),
 * which is why this answers the prefix question rather than resolving the
 * path. The client resolver still decides what the slug actually is.
 */

/** Whether `slug` sits inside a shipped database's `{host}/{db}` path space. */
export function isShippedDatabasePath(slug: string): boolean {
  return isDatabasePathPrefix(slug, {
    // Shipped pages carry `databaseIds`; there are no local block rows here.
    blocks: [],
    databases: getShippedDatabases().map((entry) => entry.doc.database),
    pages: shippedPageSummaries(),
  });
}
