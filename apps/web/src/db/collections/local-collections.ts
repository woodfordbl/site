/**
 * @fileoverview Content collections and the boot sequence that starts them.
 *
 * Two storage paths back every page: shipped defaults in the JSON files under
 * `content/pages/` (git, survives deploys) and local overlays in these
 * collections (localStorage, per-browser). Page metadata lives in
 * `localPagesCollection` (`site-local-pages`); block content lives in
 * `localBlocksCollection`, sharded one localStorage key per page
 * (`site-local-blocks:<pageId>` — see page-sharded-block-storage.ts).
 *
 * Lazy seed: shipped pages are copied into the collections only on first
 * edit, stamping `serverBaselineHash` with the shipped blocks' hash at seed
 * time. `serverBaselineHash: null` therefore means user-created — that is
 * the discriminator routing (`/p/$`), catalog merging, and stale detection
 * all rely on (see src/lib/pages/resolve-page-state.ts). User-created pages
 * insert on `page.create` with one empty text block.
 *
 * Boot fork (sync-mode.ts): the mode is fixed once per page load. Anonymous
 * mode uses localStorage collections plus the local-only boot work below
 * (storage migrations, dirty-cookie reconcile, formula-ref canonicalization).
 * Signed-in mode swaps in Electric-backed collections with identical
 * ids/schemas/keys that boot straight from the shape stream, so every import
 * site is oblivious. Cross-tab sync in local mode rides `storage` events on
 * the metadata key and block shard keys. Idle boot work (orphan-asset sweep,
 * snapshot purge) is scheduled here, off the critical path.
 *
 * Connection budget: synced mode holds five live shapes (pages, blocks,
 * databases, database_rows, my_access), each parking one long-poll for as
 * long as it is subscribed. A browser allows roughly six concurrent
 * connections per origin over HTTP/1.1, so a dev server — which serves
 * HTTP/1.1 and shares its origin with the app — has about one slot left for
 * everything else, and anything additionally holding a connection open
 * exhausts it (see the devtools note in routes/__root.tsx). Deployments serve
 * HTTP/2, where the limit does not apply; giving shapes their own origin (a
 * real Electric instance) removes it in dev too.
 */
import { BTreeIndex } from "@tanstack/db";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import {
  createCollection,
  localStorageCollectionOptions,
} from "@tanstack/react-db";
import { sweepOrphanAssets } from "@/db/assets/asset-gc.ts";
import { createBlockShardStorageEventApi } from "@/db/collections/block-shard-storage-events.ts";
import {
  createDatabaseRowShardStorageEventApi,
  DATABASE_ROW_COLLECTION_STORAGE_KEY,
  databaseShardedRowStorage,
} from "@/db/collections/database-sharded-row-storage.ts";
import {
  backfillBlockCreatedAt,
  backfillBlockFractionalIndexes,
  backfillPageCreatedAt,
  migrateCalloutsToContainers,
  migrateLocalStorageToV2,
} from "@/db/collections/migrate-local-storage.ts";
import {
  BLOCK_COLLECTION_STORAGE_KEY,
  pageShardedBlockStorage,
} from "@/db/collections/page-sharded-block-storage.ts";
import { migrateFormulaExpressionsToIdRefs } from "@/db/queries/formula-ref-migration.ts";
import { scheduleSnapshotPurge } from "@/db/snapshots/snapshot-purge.ts";
import { reconcileDirtyPagesCookie } from "@/lib/local-draft/reconcile-dirty-pages-cookie.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";
import {
  localDatabaseRowSchema,
  localDatabaseSchema,
} from "@/lib/schemas/database.ts";
import { localBlockSchema } from "@/lib/schemas/local-block.ts";
import { localFavoriteSchema } from "@/lib/schemas/local-favorite.ts";
import { localFormulaFunctionSchema } from "@/lib/schemas/local-formula-function.ts";
import { localKeybindingSchema } from "@/lib/schemas/local-keybinding.ts";
import { localPageSchema } from "@/lib/schemas/local-page.ts";
import { myAccessRowSchema } from "@/lib/schemas/page-access.ts";
import { registerSyncedReader } from "./read-local-storage-sync.ts";
import { isSyncedMode, syncContext } from "./sync-mode.ts";
import { syncedWriteHandlers } from "./synced-mutations.ts";

/**
 * Electric-backed variant of a content collection (signed-in mode). Same id,
 * same schema, same key — every import site is oblivious to the swap. Reads
 * stream from the workspace-scoped shape (auth-proxied; see
 * routes/api/sync/shape.get.ts); writes post to /api/sync/mutate and hold
 * optimistic state until the txid returns on the stream.
 */
function electricContentOptions<
  Schema extends
    | typeof localPageSchema
    | typeof localBlockSchema
    | typeof localDatabaseSchema
    | typeof localDatabaseRowSchema,
>(id: string, table: string, schema: Schema) {
  return electricCollectionOptions({
    id,
    schema,
    getKey: (item: { id: string }) => item.id,
    shapeOptions: {
      url: `${window.location.origin}/api/sync/shape`,
      params: { table, ws: syncContext.workspaceId ?? "" },
    },
    ...syncedWriteHandlers(),
  });
}

function getHotData(): Record<string, unknown> {
  if (!import.meta.hot) {
    return {};
  }

  const hot = import.meta.hot as { data?: Record<string, unknown> };
  hot.data ??= {};
  return hot.data;
}

function getOrCreateHotCollection<T>(key: string, create: () => T): T {
  const hotData = getHotData();
  const existing = hotData[key];
  if (existing) {
    return existing as T;
  }

  const collection = create();
  hotData[key] = collection;
  return collection;
}

function createLocalPagesCollection() {
  return createCollection(
    localStorageCollectionOptions({
      id: "local-pages",
      storageKey: "site-local-pages",
      getKey: (item) => item.id,
      schema: localPageSchema,
    })
  );
}
type PagesCollection = ReturnType<typeof createLocalPagesCollection>;

export const localPagesCollection = getOrCreateHotCollection(
  "localPagesCollection",
  (): PagesCollection =>
    isSyncedMode()
      ? // Same row type and key; the localStorage-only utils surface
        // (acceptMutations) is unused in synced mode — the ops layer's
        // transactions push through /api/sync/mutate instead (see
        // synced-mutations.ts), so the assertion is safe at every call site.
        (createCollection(
          electricContentOptions("local-pages", "pages", localPageSchema)
        ) as unknown as PagesCollection)
      : createLocalPagesCollection()
);

function createLocalBlocksCollection() {
  // Assigned after creation so the storage-event bridge can re-trigger sync
  // without a self-referencing annotation that would erase the collection's
  // inferred row types.
  let triggerManualSync: (() => void) | undefined;

  const collection = createCollection(
    localStorageCollectionOptions({
      id: "local-blocks",
      storageKey: BLOCK_COLLECTION_STORAGE_KEY,
      storage: pageShardedBlockStorage,
      storageEventApi: createBlockShardStorageEventApi(
        pageShardedBlockStorage,
        () => triggerManualSync?.()
      ),
      getKey: (item) => item.id,
      schema: localBlockSchema,
    })
  );

  triggerManualSync = () => {
    const sync = collection.config.sync as { manualTrigger?: () => void };
    sync.manualTrigger?.();
  };

  return collection;
}
type BlocksCollection = ReturnType<typeof createLocalBlocksCollection>;

export const localBlocksCollection = getOrCreateHotCollection(
  "localBlocksCollection",
  (): BlocksCollection =>
    isSyncedMode()
      ? (createCollection(
          electricContentOptions("local-blocks", "blocks", localBlockSchema)
        ) as unknown as BlocksCollection)
      : createLocalBlocksCollection()
);

/**
 * User keyboard-shortcut overrides. Holds one row per command the user has
 * rebound away from its registry default; the resolved binding is the default
 * overlaid with any matching row here.
 */
export const localKeybindingsCollection = getOrCreateHotCollection(
  "localKeybindingsCollection",
  () =>
    createCollection(
      localStorageCollectionOptions({
        id: "local-keybindings",
        storageKey: "site-local-keybindings",
        getKey: (item) => item.id,
        schema: localKeybindingSchema,
      })
    )
);

/**
 * Pages the user has pinned to the sidebar Favorites section. Holds one row per
 * favorite keyed by page id, so a favorite resolves the same whether the page is
 * user-created locally or served from shipped content.
 */
export const localFavoritesCollection = getOrCreateHotCollection(
  "localFavoritesCollection",
  () =>
    createCollection(
      localStorageCollectionOptions({
        id: "local-favorites",
        storageKey: "site-local-favorites",
        getKey: (item) => item.id,
        schema: localFavoriteSchema,
      })
    )
);

/**
 * Named user-defined formula functions (Sheets Named Functions model) —
 * workspace-level like keybindings: one row per definition, callable from
 * any formula. Small rows, plain single-key localStorage persistence. CRUD
 * + name validation: `db/queries/formula-function-ops.ts`.
 */
export const localFormulaFunctionsCollection = getOrCreateHotCollection(
  "localFormulaFunctionsCollection",
  () =>
    createCollection(
      localStorageCollectionOptions({
        id: "local-formula-functions",
        storageKey: "site-local-formula-functions",
        getKey: (item) => item.id,
        schema: localFormulaFunctionSchema,
      })
    )
);

/**
 * Notion-style database definitions (fields, views, source config). Small,
 * page-metadata-sized rows — plain single-key localStorage persistence.
 */
function createLocalDatabasesCollection() {
  return createCollection(
    localStorageCollectionOptions({
      id: "local-databases",
      storageKey: "site-local-databases",
      getKey: (item) => item.id,
      schema: localDatabaseSchema,
    })
  );
}
type DatabasesCollection = ReturnType<typeof createLocalDatabasesCollection>;

export const localDatabasesCollection = getOrCreateHotCollection(
  "localDatabasesCollection",
  (): DatabasesCollection =>
    isSyncedMode()
      ? (createCollection(
          electricContentOptions(
            "local-databases",
            "databases",
            localDatabaseSchema
          )
        ) as unknown as DatabasesCollection)
      : createLocalDatabasesCollection()
);

/**
 * Database rows, sharded into one localStorage key per database
 * (`site-local-db-rows:<databaseId>`) so cell edits rewrite only that
 * database's shard — same pattern as `localBlocksCollection`.
 */
function createLocalDatabaseRowsCollection() {
  // Assigned after creation so the storage-event bridge can re-trigger sync
  // without a self-referencing annotation that would erase the collection's
  // inferred row types.
  let triggerManualSync: (() => void) | undefined;

  const collection = createCollection(
    localStorageCollectionOptions({
      id: "local-database-rows",
      storageKey: DATABASE_ROW_COLLECTION_STORAGE_KEY,
      storage: databaseShardedRowStorage,
      storageEventApi: createDatabaseRowShardStorageEventApi(
        databaseShardedRowStorage,
        () => triggerManualSync?.()
      ),
      getKey: (item) => item.id,
      schema: localDatabaseRowSchema,
    })
  );

  triggerManualSync = () => {
    const sync = collection.config.sync as { manualTrigger?: () => void };
    sync.manualTrigger?.();
  };

  // Rows are almost always queried per database; the index turns those
  // `eq(row.databaseId, id)` live queries into constant-time lookups.
  // BTree over Basic: cell edits make this a write-heavy collection.
  collection.createIndex((row) => row.databaseId, { indexType: BTreeIndex });

  return collection;
}
type DatabaseRowsCollection = ReturnType<
  typeof createLocalDatabaseRowsCollection
>;

export const localDatabaseRowsCollection = getOrCreateHotCollection(
  "localDatabaseRowsCollection",
  (): DatabaseRowsCollection => {
    if (isSyncedMode()) {
      const synced = createCollection(
        electricContentOptions(
          "local-database-rows",
          "database_rows",
          localDatabaseRowSchema
        )
      ) as unknown as DatabaseRowsCollection;
      synced.createIndex((row) => row.databaseId, { indexType: BTreeIndex });
      return synced;
    }
    return createLocalDatabaseRowsCollection();
  }
);

/**
 * Synced mode only (null in local mode, where there is no server and every
 * page belongs to the visitor): the signed-in user's own effective access
 * level per page, streamed live from the `my_access` pseudo-shape (see
 * src/server/shape-host.server.ts). Read-only — permission changes go through
 * `POST /api/pages/permissions`; grants/revocations land here as inserts/
 * deletes, which is what keeps the access-aware chrome and read-only gating
 * live without polling.
 */
function createMyAccessCollection() {
  return createCollection(
    electricCollectionOptions({
      id: "my-access",
      schema: myAccessRowSchema,
      getKey: (item) => item.pageId,
      shapeOptions: {
        url: `${window.location.origin}/api/sync/shape`,
        params: { table: "my_access", ws: syncContext.workspaceId ?? "" },
      },
    })
  );
}
type MyAccessCollection = ReturnType<typeof createMyAccessCollection>;

export const myAccessCollection: MyAccessCollection | null = isSyncedMode()
  ? getOrCreateHotCollection("myAccessCollection", createMyAccessCollection)
  : null;

/** Reclaim orphaned media blobs once per boot, off the critical path. */
function scheduleOrphanAssetSweep(): void {
  const run = () => {
    sweepOrphanAssets().catch(() => undefined);
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 30_000 });
    return;
  }
  window.setTimeout(run, 10_000);
}

function startLocalCollectionsSync(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (getHotData().localCollectionsSyncStarted) {
    return;
  }

  if (!isSyncedMode()) {
    // localStorage migrations and the SSR dirty-cookie only exist in
    // anonymous local mode; synced collections boot straight from the shape
    // stream.
    backfillPageCreatedAt();
    backfillBlockCreatedAt();
    migrateLocalStorageToV2();
    // After shards exist (post-V2), fold legacy leaf callouts into the
    // container model so their text survives the schema strip on read.
    migrateCalloutsToContainers();
    // After callout children exist so they get keys too: assign the durable
    // per-block fractional indexes in each page's legacy blockOrder.
    backfillBlockFractionalIndexes();
    reconcileDirtyPagesCookie();
  }
  localPagesCollection.startSyncImmediate();
  localBlocksCollection.startSyncImmediate();
  localKeybindingsCollection.startSyncImmediate();
  localFavoritesCollection.startSyncImmediate();
  localFormulaFunctionsCollection.startSyncImmediate();
  localDatabasesCollection.startSyncImmediate();
  localDatabaseRowsCollection.startSyncImmediate();
  myAccessCollection?.startSyncImmediate();
  if (!isSyncedMode()) {
    // Canonicalize stored formula references (name → field id) now that the
    // databases collection is live. The writer is injected to keep the module
    // graph acyclic; direct collection updates persist like any other
    // localStorage-collection write. (Local-mode-only: synced workspaces were
    // born on the v2 formula language.)
    migrateFormulaExpressionsToIdRefs(
      localDatabasesCollection.toArray,
      (databaseId, fieldId, expression) => {
        localDatabasesCollection.update(databaseId, (draft) => {
          draft.fields = draft.fields.map((field) =>
            field.id === fieldId
              ? // The migration only ever targets formula fields, so the
                // merged object stays a valid union member.
                ({ ...field, expression } as DatabaseField)
              : field
          );
          draft.updatedAt = new Date().toISOString();
        });
      }
    );
  }
  scheduleOrphanAssetSweep();
  scheduleSnapshotPurge();
  getHotData().localCollectionsSyncStarted = true;
  // Synced mode: the raw-localStorage fast reads (persist-page-metadata's
  // seeded-check and friends) resolve against the live collection instead.
  registerSyncedReader("site-local-pages", () => localPagesCollection.toArray);
  if (import.meta.env.DEV) {
    // Dev-only introspection handle (used by scripts/demo probes).
    (window as unknown as Record<string, unknown>).__collections = {
      pages: localPagesCollection,
      blocks: localBlocksCollection,
      databases: localDatabasesCollection,
      rows: localDatabaseRowsCollection,
    };
  }
}

startLocalCollectionsSync();
