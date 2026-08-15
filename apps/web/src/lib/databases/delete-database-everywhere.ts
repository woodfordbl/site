import { reportPersistenceError } from "@/db/persistence-errors.ts";
import { deleteDatabase } from "@/db/queries/database-collection-ops.ts";
import type { PageCommand } from "@/lib/canvas/commands.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { resolveDatabaseOwnedPageDeleteRoots } from "@/lib/databases/database-owned-pages.ts";
import { deleteDatabaseBlockReferences } from "@/lib/databases/delete-database-block-references.ts";

interface DeleteDatabasesEverywhereOptions {
  databaseIds: readonly string[];
  dispatchPage: (command: PageCommand) => void;
  pages: PageSummary[];
}

/**
 * The one destructive database delete, shared by the sidebar row menu, the
 * database settings menu, and the canvas `database` block. Per database it:
 *
 * 1. deletes the hub page and every materialized row page (`page.delete`
 *    cascades their descendants and strips `pageLink` blocks pointing at them),
 * 2. deletes the definition, its rows, field history, and row template
 *    ({@link deleteDatabase}, tombstoning seeded shipped databases), and
 * 3. strips every linked `database` block from every page
 *    ({@link deleteDatabaseBlockReferences}).
 *
 * Together those clear both sidebar surfaces — the workspace **Databases**
 * section (entity-driven) and the hosted-database rows under each host page
 * (block-driven). Not undoable; callers confirm first.
 */
export function deleteDatabasesEverywhere({
  databaseIds,
  dispatchPage,
  pages,
}: DeleteDatabasesEverywhereOptions): void {
  for (const databaseId of databaseIds) {
    for (const pageId of resolveDatabaseOwnedPageDeleteRoots(
      databaseId,
      pages
    )) {
      dispatchPage({ type: "page.delete", pageId });
    }

    deleteDatabase(databaseId);
    // Fire-and-forget: the cascade seeds shipped host pages, which needs an
    // await. Failures surface as the standard persistence toast rather than
    // rejecting into the click handler.
    deleteDatabaseBlockReferences(databaseId, pages).catch(
      reportPersistenceError
    );
  }
}
