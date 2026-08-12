import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { reportPersistenceError } from "@/db/persistence-errors.ts";
import { setDatabaseRowPageId } from "@/db/queries/database-collection-ops.ts";
import type { PageCommand } from "@/lib/canvas/commands.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { resolveRowSlug } from "@/lib/databases/database-page-paths.ts";
import { resolveDatabaseRowPageTitle } from "@/lib/databases/database-row-page-title.ts";
import { ensureDatabaseHubPage } from "@/lib/databases/ensure-database-hub-page.ts";
import { localFormulaRelationResolver } from "@/lib/databases/formula-relations.ts";
import { instantiateTemplateBlocks } from "@/lib/databases/row-template.ts";
import { readRowTemplateSnapshot } from "@/lib/databases/row-template-store.ts";
import {
  dedupePageSegment,
  siblingPages,
} from "@/lib/pages/build-page-tree.ts";
import { clonePageBlocks } from "@/lib/pages/clone-page-blocks.ts";
import { buildChildSlug } from "@/lib/pages/slugify.ts";
import type {
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

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

/**
 * Resolve or create a materialized page for a database row.
 *
 * - Returns an existing `row.pageId` when the page still exists in `pages`
 * - Creates via `page.create` with optional navigation (`navigate` defaults
 *   false for seed-on-demand; routes already own navigation)
 * - Local and connector-synced rows both seed — synced rows still need a real
 *   page for header/cover/menu; property sync continues on the row entity
 * @see docs/architecture/databases.md#row-pages-slug-paths--seed-on-open
 */
export async function ensureDatabaseRowPage(options: {
  database: LocalDatabase;
  dispatch: (command: PageCommand) => void;
  navigate?: boolean;
  pages: readonly PageSummary[];
  row: LocalDatabaseRow;
}): Promise<string | null> {
  const { database, dispatch, pages, row } = options;
  const navigate = options.navigate === true;

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
    const hubPageId = await ensureDatabaseHubPage({
      database,
      dispatch,
      pages,
    });
    const hub =
      (hubPageId
        ? (localPagesCollection.get(hubPageId) ??
          pages.find((page) => page.id === hubPageId))
        : undefined) ?? null;
    if (!hub) {
      return null;
    }
    const template = readRowTemplateSnapshot(database.id);
    const blocks = clonePageBlocks(
      instantiateTemplateBlocks(
        template?.blocks,
        database.fields,
        row.values,
        // relations: template tokens can traverse relation fields — the
        // materialized copy must evaluate them like the virtual render does.
        { now: () => new Date(), relations: localFormulaRelationResolver() }
      )
    );
    const rowSegment = dedupePageSegment(
      resolveRowSlug(database, row),
      siblingPages({ id: pageId, parentId: hub.id, slug: "", title }, [
        ...pages,
        ...localPagesCollection.toArray,
      ])
    );
    // Hub slug is already `{host}/{db}`; only append the row segment.
    const slug = buildChildSlug(hub.slug, rowSegment);

    dispatch({
      type: "page.create",
      pageId,
      parentId: hub.id,
      slug,
      databaseRowSource: { databaseId: database.id, rowId: row.id },
      title,
      initialBlocks: blocks,
      // The materialized page inherits the template's icon; font only when
      // the template explicitly set one (page default otherwise).
      icon: row.icon ?? template?.icon,
      font: template?.font,
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
