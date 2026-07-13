import {
  localBlocksCollection,
  localPagesCollection,
} from "@/db/collections/local-collections.ts";
import { reportPersistenceError } from "@/db/persistence-errors.ts";
import { setDatabaseRowPageId } from "@/db/queries/database-collection-ops.ts";
import type { PageCommand } from "@/lib/canvas/commands.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { cellToPlainText } from "@/lib/databases/cell-values.ts";
import { localFormulaRelationResolver } from "@/lib/databases/formula-relations.ts";
import { resolveDatabaseHostParentId } from "@/lib/databases/resolve-database-host-page.ts";
import { instantiateTemplateBlocks } from "@/lib/databases/row-template.ts";
import { clonePageBlocks } from "@/lib/pages/clone-page-blocks.ts";
import type {
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/** Title used when the primary cell is empty (matches the row-page shell). */
export const ROW_PAGE_FALLBACK_TITLE = "Untitled";

/** Poll cadence/budget while confirming the optimistic `page.create` landed. */
const LINK_POLL_INTERVAL_MS = 50;
/** ~5s total — `page.create` includes a page-list fetch before the insert. */
const LINK_POLL_MAX_ATTEMPTS = 100;

/**
 * Adopt the created page onto the row only once the page ACTUALLY exists in
 * the local pages collection — `page.create` is optimistic but async.
 */
function linkRowOncePageExists(
  rowId: string,
  pageId: string,
  onDone: (linked: boolean) => void,
  attempt = 0
): void {
  if (localPagesCollection.get(pageId)) {
    setDatabaseRowPageId(rowId, pageId);
    onDone(true);
    return;
  }
  if (attempt >= LINK_POLL_MAX_ATTEMPTS) {
    onDone(false);
    return;
  }
  window.setTimeout(() => {
    linkRowOncePageExists(rowId, pageId, onDone, attempt + 1);
  }, LINK_POLL_INTERVAL_MS);
}

function linkRowOncePageExistsAsync(
  rowId: string,
  pageId: string
): Promise<boolean> {
  return new Promise((resolve) => {
    linkRowOncePageExists(rowId, pageId, resolve);
  });
}

/** Plain-text title for a row's page (primary field, or Untitled). */
export function resolveDatabaseRowPageTitle(
  database: LocalDatabase,
  row: LocalDatabaseRow
): string {
  const primaryField = database.fields.find(
    (field) => field.id === database.primaryFieldId
  );
  const title = primaryField
    ? cellToPlainText(primaryField, row.values[primaryField.id]).trim()
    : "";
  return title === "" ? ROW_PAGE_FALLBACK_TITLE : title;
}

/**
 * Resolve or create a materialized page for a database row.
 *
 * - Returns an existing `row.pageId` when the page still exists in `pages`
 * - Synced rows (`externalId`) return `null` (never materialize)
 * - Creates via `page.create` with optional navigation (`navigate` defaults
 *   true for the row-page "Edit" flow; pass `false` for menu side-effects)
 * @see docs/architecture/databases.md#row-pages-virtual--copy-on-write
 */
export async function ensureDatabaseRowPage(options: {
  database: LocalDatabase;
  dispatch: (command: PageCommand) => void;
  navigate?: boolean;
  pages: readonly PageSummary[];
  row: LocalDatabaseRow;
}): Promise<string | null> {
  const { database, dispatch, pages, row } = options;
  const navigate = options.navigate !== false;

  if (row.externalId) {
    return null;
  }

  if (row.pageId) {
    const existing =
      pages.find((page) => page.id === row.pageId) ??
      localPagesCollection.get(row.pageId);
    if (existing) {
      return row.pageId;
    }
  }

  const pageId = crypto.randomUUID();
  const title = resolveDatabaseRowPageTitle(database, row);

  try {
    const blocks = clonePageBlocks(
      instantiateTemplateBlocks(
        database.rowTemplate,
        database.fields,
        row.values,
        // relations: template tokens can traverse relation fields — the
        // materialized copy must evaluate them like the virtual render does.
        { now: () => new Date(), relations: localFormulaRelationResolver() }
      )
    );
    const parentId = resolveDatabaseHostParentId({
      blocks: localBlocksCollection.toArray,
      databaseId: database.id,
      pages: pages as PageSummary[],
    });

    dispatch({
      type: "page.create",
      pageId,
      parentId,
      databaseRowSource: { databaseId: database.id, rowId: row.id },
      title,
      initialBlocks: blocks,
      navigate,
    });
  } catch (error) {
    reportPersistenceError(error);
    return null;
  }

  const linked = await linkRowOncePageExistsAsync(row.id, pageId);
  if (!linked) {
    reportPersistenceError(
      new Error("Row page creation did not complete — row left unlinked")
    );
    return null;
  }
  return pageId;
}
