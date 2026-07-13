import {
  localBlocksCollection,
  localPagesCollection,
} from "@/db/collections/local-collections.ts";
import { reportPersistenceError } from "@/db/persistence-errors.ts";
import {
  beginPageBlockTransaction,
  commitPageBlockTransaction,
  deletePageBlocksInTx,
  insertPageBlockAt,
} from "@/db/queries/block-collection-ops.ts";
import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import type { PageCommand } from "@/lib/canvas/commands.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  buildDatabaseHubSlug,
  resolveDatabaseSlug,
} from "@/lib/databases/database-page-paths.ts";
import { resolveDatabaseHostParentId } from "@/lib/databases/resolve-database-host-page.ts";
import {
  dedupePageSegment,
  siblingPages,
} from "@/lib/pages/build-page-tree.ts";
import type { LocalDatabase } from "@/lib/schemas/database.ts";

const POLL_INTERVAL_MS = 50;
const POLL_MAX_ATTEMPTS = 100;

function waitForPage(pageId: string, attempt = 0): Promise<boolean> {
  if (localPagesCollection.get(pageId)) {
    return Promise.resolve(true);
  }
  if (attempt >= POLL_MAX_ATTEMPTS) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve(waitForPage(pageId, attempt + 1));
    }, POLL_INTERVAL_MS);
  });
}

function createHubDatabaseBlock(databaseId: string) {
  return {
    ...createEmptyBlock("database"),
    props: { databaseId },
  };
}

function blockDatabaseId(props: unknown): string | undefined {
  if (typeof props !== "object" || props === null) {
    return;
  }
  const { databaseId } = props as { databaseId?: unknown };
  return typeof databaseId === "string" ? databaseId : undefined;
}

/**
 * Ensures the hub page canvas includes a linked `database` block for this
 * database. Existing hubs created before hub-as-PageWorkspace may only have
 * the default empty text row.
 */
export function ensureDatabaseHubContent(
  pageId: string,
  databaseId: string
): void {
  const page = localPagesCollection.get(pageId);
  if (!page) {
    return;
  }

  const blocks = localBlocksCollection.toArray.filter(
    (block) => block.pageId === pageId
  );
  if (
    blocks.some(
      (block) =>
        block.type === "database" && blockDatabaseId(block.props) === databaseId
    )
  ) {
    return;
  }

  const databaseBlock = createHubDatabaseBlock(databaseId);
  const order = page.blockOrder ?? blocks.map((block) => block.id);
  const tx = beginPageBlockTransaction(pageId, order);

  const soleEmptyText =
    blocks.length === 1 &&
    blocks[0]?.type === "text" &&
    typeof blocks[0].props === "object" &&
    blocks[0].props !== null &&
    (blocks[0].props as { text?: string }).text === "";

  if (soleEmptyText && blocks[0]) {
    deletePageBlocksInTx(pageId, [blocks[0].id], tx);
    insertPageBlockAt(pageId, databaseBlock, 0, tx);
  } else {
    insertPageBlockAt(pageId, databaseBlock, 0, tx);
  }

  commitPageBlockTransaction(tx);
}

/** Resolves or creates the page that owns a database's slug route. */
export async function ensureDatabaseHubPage(options: {
  database: LocalDatabase;
  dispatch: (command: PageCommand) => void;
  pages: readonly PageSummary[];
}): Promise<string | null> {
  const existing = options.pages.find(
    (page) => page.databaseSource?.databaseId === options.database.id
  );
  if (existing) {
    ensureDatabaseHubContent(existing.id, options.database.id);
    return existing.id;
  }

  const parentId = resolveDatabaseHostParentId({
    blocks: localBlocksCollection.toArray,
    databaseId: options.database.id,
    pages: options.pages,
  });
  const parent = parentId
    ? options.pages.find((page) => page.id === parentId)
    : undefined;
  if (parentId && !parent) {
    return null;
  }

  const pageId = crypto.randomUUID();
  const siblings = siblingPages(
    {
      id: pageId,
      parentId,
      slug: "",
      title: options.database.name,
    },
    [...options.pages]
  );
  const segment = dedupePageSegment(
    resolveDatabaseSlug(options.database),
    siblings
  );
  const slug = buildDatabaseHubSlug(parent?.slug ?? "/", segment);

  try {
    options.dispatch({
      type: "page.create",
      pageId,
      parentId,
      slug,
      title: options.database.name,
      icon: options.database.icon,
      databaseSource: { databaseId: options.database.id },
      initialBlocks: [createHubDatabaseBlock(options.database.id)],
      navigate: false,
    });
  } catch (error) {
    reportPersistenceError(error);
    return null;
  }

  return (await waitForPage(pageId)) ? pageId : null;
}
