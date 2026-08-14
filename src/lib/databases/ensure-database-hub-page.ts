import { createTransaction } from "@tanstack/react-db";

import {
  localBlocksCollection,
  localPagesCollection,
} from "@/db/collections/local-collections.ts";
import { isSyncedMode } from "@/db/collections/sync-mode.ts";
import type { TransactionLike } from "@/db/collections/synced-mutations.ts";
import { pushTransactionMutations } from "@/db/collections/synced-mutations.ts";
import { reportPersistenceError } from "@/db/persistence-errors.ts";
import {
  beginPageBlockTransaction,
  commitPageBlockTransaction,
  deletePageBlocksInTx,
  insertPageBlockAt,
  updatePageBlockInTx,
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
import type { Block } from "@/lib/schemas/block.ts";
import type { DatabaseProps } from "@/lib/schemas/block-props.ts";
import type { LocalDatabase } from "@/lib/schemas/database.ts";
import type { LocalBlock } from "@/lib/schemas/local-block.ts";
import { toBlock } from "@/lib/schemas/local-block.ts";

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

/** The hub page's linked `database` block used for `viewId` persistence only. */
export function findHubDatabaseBlock(
  pageId: string,
  databaseId: string
): LocalBlock | undefined {
  return localBlocksCollection.toArray.find(
    (block) =>
      block.pageId === pageId &&
      block.type === "database" &&
      blockDatabaseId(block.props) === databaseId
  );
}

/**
 * Persists the hub's active saved-view id onto the ghost linked `database`
 * block (hubs no longer mount a canvas, but the block still stores `viewId`).
 */
export function setHubDatabaseBlockViewId(
  pageId: string,
  databaseId: string,
  viewId: string
): void {
  const page = localPagesCollection.get(pageId);
  const block = findHubDatabaseBlock(pageId, databaseId);
  if (!(page && block)) {
    return;
  }

  const props = block.props as DatabaseProps;
  if (props.viewId === viewId) {
    return;
  }

  const order = page.blockOrder ?? [block.id];
  const tx = beginPageBlockTransaction(pageId, order);
  const nextBlock: Block = {
    ...toBlock(block),
    type: "database",
    props: { ...props, viewId },
  };
  updatePageBlockInTx(pageId, nextBlock, true, tx);
  commitPageBlockTransaction(tx);
}

/**
 * Mirrors `database.name` / `database.icon` onto the hub page when they have
 * drifted (older hubs edited page metadata independently of the entity).
 */
export function syncHubPageMetadataFromDatabase(
  pageId: string,
  database: LocalDatabase
): void {
  const page = localPagesCollection.get(pageId);
  if (!page) {
    return;
  }
  if (page.title === database.name && page.icon === database.icon) {
    return;
  }

  const timestamp = new Date().toISOString();
  const tx = createTransaction({
    autoCommit: false,
    mutationFn: async ({ transaction }) => {
      if (isSyncedMode()) {
        await pushTransactionMutations(
          transaction as unknown as TransactionLike
        );
        return;
      }
      localPagesCollection.utils.acceptMutations(transaction);
      await Promise.resolve();
    },
  });
  tx.mutate(() => {
    localPagesCollection.update(pageId, (draft) => {
      draft.title = database.name;
      draft.icon = database.icon;
      draft.updatedAt = timestamp;
    });
  });
  tx.commit().catch(reportPersistenceError);
}

/**
 * Ensures the hub page includes a linked `database` block for this database
 * (ghost storage for `viewId` — hubs render `DatabaseTableView` directly).
 * Existing hubs created before hub-as-PageWorkspace may only have the default
 * empty text row.
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
