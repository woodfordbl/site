import {
  BLOCK_SHARD_PREFIX,
  blockShardStorageKey,
} from "@/db/collections/page-sharded-block-storage.ts";
import { assignFractionalIndexes } from "@/lib/blocks/fractional-order.ts";
import type { Block } from "@/lib/schemas/block.ts";
import { toLocalBlock } from "@/lib/schemas/local-block.ts";
import {
  legacyLocalPageSchema,
  localPageSchema,
} from "@/lib/schemas/local-page.ts";

const LEGACY_PAGES_KEY = "site-local-pages";
const MIGRATION_FLAG_KEY = "site-local-storage-v2";
const CREATED_AT_BACKFILL_FLAG_KEY = "site-local-pages-created-at-backfill";
const BLOCK_CREATED_AT_BACKFILL_FLAG_KEY =
  "site-local-blocks-created-at-backfill";
const CALLOUT_CONTAINER_FLAG_KEY = "site-callout-container-v1";
const FRACTIONAL_INDEX_BACKFILL_FLAG_KEY =
  "site-local-blocks-fractional-index-backfill";

export {
  BLOCK_CREATED_AT_BACKFILL_FLAG_KEY,
  CALLOUT_CONTAINER_FLAG_KEY,
  CREATED_AT_BACKFILL_FLAG_KEY,
  FRACTIONAL_INDEX_BACKFILL_FLAG_KEY,
  LEGACY_PAGES_KEY,
};

interface StoredItem<T> {
  data: T;
  versionKey: string;
}

function readLegacyPages(): Array<{
  meta: ReturnType<typeof localPageSchema.parse>;
  blocks: Block[];
}> {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = localStorage.getItem(LEGACY_PAGES_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as Record<string, StoredItem<unknown>>;
    const pages: Array<{
      meta: ReturnType<typeof localPageSchema.parse>;
      blocks: Block[];
    }> = [];

    for (const stored of Object.values(parsed)) {
      const legacy = legacyLocalPageSchema.safeParse(stored.data);
      if (!(legacy.success && Array.isArray(legacy.data.blocks))) {
        const metaOnly = localPageSchema.safeParse(stored.data);
        if (metaOnly.success) {
          pages.push({ meta: metaOnly.data, blocks: [] });
        }
        continue;
      }

      const { blocks, ...metaFields } = legacy.data;
      const meta = localPageSchema.parse(metaFields);
      const blockList = blocks.filter(
        (block): block is Block =>
          typeof block === "object" &&
          block !== null &&
          "id" in block &&
          "type" in block
      );
      pages.push({ meta, blocks: blockList });
    }

    return pages;
  } catch {
    return [];
  }
}

function writePageMeta(
  pages: ReturnType<typeof localPageSchema.parse>[]
): void {
  const map: Record<
    string,
    StoredItem<ReturnType<typeof localPageSchema.parse>>
  > = {};

  for (const page of pages) {
    map[page.id] = {
      data: page,
      versionKey: page.updatedAt,
    };
  }

  localStorage.setItem(LEGACY_PAGES_KEY, JSON.stringify(map));
}

function writeBlockShard(pageId: string, blocks: Block[]): void {
  const now = new Date().toISOString();
  const shard: Record<string, StoredItem<ReturnType<typeof toLocalBlock>>> = {};

  for (const block of blocks) {
    const localBlock = toLocalBlock(block, pageId, now);
    shard[block.id] = {
      data: localBlock,
      versionKey: localBlock.updatedAt,
    };
  }

  if (Object.keys(shard).length === 0) {
    localStorage.removeItem(blockShardStorageKey(pageId));
    return;
  }

  localStorage.setItem(blockShardStorageKey(pageId), JSON.stringify(shard));
}

export function migrateLocalStorageToV2(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (localStorage.getItem(MIGRATION_FLAG_KEY) === "done") {
    return;
  }

  const legacyPages = readLegacyPages();
  const hasEmbeddedBlocks = legacyPages.some((page) => page.blocks.length > 0);

  if (!hasEmbeddedBlocks) {
    localStorage.setItem(MIGRATION_FLAG_KEY, "done");
    return;
  }

  const metaPages = legacyPages.map((page) => page.meta);
  writePageMeta(metaPages);

  for (const page of legacyPages) {
    writeBlockShard(page.meta.id, page.blocks);
  }

  localStorage.setItem(MIGRATION_FLAG_KEY, "done");
}

export function backfillPageCreatedAt(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (localStorage.getItem(CREATED_AT_BACKFILL_FLAG_KEY) === "done") {
    return;
  }

  try {
    const raw = localStorage.getItem(LEGACY_PAGES_KEY);
    if (!raw) {
      localStorage.setItem(CREATED_AT_BACKFILL_FLAG_KEY, "done");
      return;
    }

    const parsed = JSON.parse(raw) as Record<
      string,
      StoredItem<Record<string, unknown>>
    >;
    let changed = false;

    for (const stored of Object.values(parsed)) {
      const data = stored.data;
      if (!data || typeof data !== "object") {
        continue;
      }

      const updatedAt = data.updatedAt;
      if (typeof updatedAt !== "string") {
        continue;
      }

      if (typeof data.createdAt === "string") {
        continue;
      }

      data.createdAt = updatedAt;
      changed = true;
    }

    if (changed) {
      localStorage.setItem(LEGACY_PAGES_KEY, JSON.stringify(parsed));
    }

    localStorage.setItem(CREATED_AT_BACKFILL_FLAG_KEY, "done");
  } catch {
    localStorage.setItem(CREATED_AT_BACKFILL_FLAG_KEY, "done");
  }
}

/** Backfills `createdAt` for one shard key; returns whether it changed. */
function backfillShardCreatedAt(key: string): void {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return;
  }

  const shard = JSON.parse(raw) as Record<
    string,
    StoredItem<Record<string, unknown>>
  >;
  let changed = false;

  for (const stored of Object.values(shard)) {
    const data = stored.data;
    if (!data || typeof data !== "object") {
      continue;
    }
    if (
      typeof data.createdAt === "string" ||
      typeof data.updatedAt !== "string"
    ) {
      continue;
    }
    data.createdAt = data.updatedAt;
    changed = true;
  }

  if (changed) {
    localStorage.setItem(key, JSON.stringify(shard));
  }
}

/**
 * Migrates one shard's legacy callouts (leaf `{ text, icon }`) into the
 * container model: the callout keeps only `{ icon }` and its text is moved into
 * a new `text` child row. Runs before the schema strips the now-unknown `text`
 * key on read, so existing callout content is preserved. The child is added
 * without touching `blockOrder` — ids missing from the order still group under
 * their parent (`orderBlocksByIds`), matching how `ensure*MinimumChildren`
 * backfills already behave.
 */
function migrateCalloutsInShard(key: string): void {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return;
  }

  const shard = JSON.parse(raw) as Record<
    string,
    StoredItem<Record<string, unknown>>
  >;
  const now = new Date().toISOString();
  const additions: Record<string, StoredItem<Record<string, unknown>>> = {};
  let changed = false;

  for (const [mapKey, stored] of Object.entries(shard)) {
    const data = stored.data;
    if (!data || typeof data !== "object" || data.type !== "callout") {
      continue;
    }
    const props = data.props as Record<string, unknown> | undefined;
    if (!props || typeof props.text !== "string") {
      continue;
    }

    const text = props.text;
    const icon = typeof props.icon === "string" ? props.icon : undefined;
    data.props = icon === undefined ? {} : { icon };
    changed = true;

    // Shard map keys carry the collection's key prefix (e.g. `s:<id>`); derive
    // it from this entry so the new child is keyed the same way and the
    // collection recognizes it on read.
    const calloutId = (data.id as string | undefined) ?? mapKey;
    const keyPrefix = mapKey.endsWith(calloutId)
      ? mapKey.slice(0, mapKey.length - calloutId.length)
      : "";

    const childId = crypto.randomUUID();
    const child: Record<string, unknown> = {
      id: childId,
      type: "text",
      parentId: calloutId,
      props: { text },
      pageId: data.pageId,
      createdAt: typeof data.createdAt === "string" ? data.createdAt : now,
      updatedAt: now,
    };
    additions[`${keyPrefix}${childId}`] = { data: child, versionKey: now };
  }

  if (changed) {
    localStorage.setItem(key, JSON.stringify({ ...shard, ...additions }));
  }
}

/** Converts legacy leaf callouts across all shards into the container model. */
export function migrateCalloutsToContainers(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (localStorage.getItem(CALLOUT_CONTAINER_FLAG_KEY) === "done") {
    return;
  }

  try {
    const shardKeys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(BLOCK_SHARD_PREFIX)) {
        shardKeys.push(key);
      }
    }

    for (const key of shardKeys) {
      migrateCalloutsInShard(key);
    }

    localStorage.setItem(CALLOUT_CONTAINER_FLAG_KEY, "done");
  } catch {
    localStorage.setItem(CALLOUT_CONTAINER_FLAG_KEY, "done");
  }
}

/** `pageId → blockOrder` for every stored local page carrying an order. */
function readPageBlockOrders(): Map<string, string[]> {
  const orders = new Map<string, string[]>();
  const raw = localStorage.getItem(LEGACY_PAGES_KEY);
  if (!raw) {
    return orders;
  }

  const parsed = JSON.parse(raw) as Record<
    string,
    StoredItem<Record<string, unknown>>
  >;
  for (const stored of Object.values(parsed)) {
    const data = stored.data;
    if (!data || typeof data !== "object") {
      continue;
    }
    const { id, blockOrder } = data;
    if (typeof id === "string" && Array.isArray(blockOrder)) {
      orders.set(
        id,
        blockOrder.filter((entry): entry is string => typeof entry === "string")
      );
    }
  }
  return orders;
}

/**
 * Assigns `fractionalIndex` to one shard's rows that lack it, in the page's
 * legacy `blockOrder` (rows missing from the order — e.g. container children
 * backfilled by earlier migrations — keep their append-last position). Rows
 * that already carry a consistent index keep it.
 */
function backfillShardFractionalIndexes(
  key: string,
  blockOrder: string[]
): void {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return;
  }

  const shard = JSON.parse(raw) as Record<
    string,
    StoredItem<Record<string, unknown>>
  >;
  const rowsById = new Map<string, Record<string, unknown>>();
  for (const stored of Object.values(shard)) {
    const data = stored.data;
    if (data && typeof data === "object" && typeof data.id === "string") {
      rowsById.set(data.id, data);
    }
  }

  const inOrder = blockOrder.filter((id) => rowsById.has(id));
  const orderedIds = new Set(inOrder);
  const documentOrder = [
    ...inOrder,
    ...[...rowsById.keys()].filter((id) => !orderedIds.has(id)),
  ];

  const indexById = new Map<string, string | undefined>(
    documentOrder.map((id) => {
      const stored = rowsById.get(id)?.fractionalIndex;
      return [id, typeof stored === "string" ? stored : undefined];
    })
  );
  if ([...indexById.values()].every((index) => index !== undefined)) {
    return;
  }

  const assigned = assignFractionalIndexes(
    documentOrder,
    indexById,
    documentOrder
  );
  for (const [id, fractionalIndex] of assigned) {
    const row = rowsById.get(id);
    if (row) {
      row.fractionalIndex = fractionalIndex;
    }
  }

  localStorage.setItem(key, JSON.stringify(shard));
}

/**
 * Assigns initial `fractionalIndex` keys to legacy block rows across all
 * shards, in each page's `blockOrder`. Idempotent (flag-guarded, and a no-op
 * for already-indexed shards); runs once per boot like its siblings.
 */
export function backfillBlockFractionalIndexes(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (localStorage.getItem(FRACTIONAL_INDEX_BACKFILL_FLAG_KEY) === "done") {
    return;
  }

  try {
    const blockOrders = readPageBlockOrders();
    const shardKeys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(BLOCK_SHARD_PREFIX)) {
        shardKeys.push(key);
      }
    }

    for (const key of shardKeys) {
      const pageId = key.slice(BLOCK_SHARD_PREFIX.length);
      backfillShardFractionalIndexes(key, blockOrders.get(pageId) ?? []);
    }

    localStorage.setItem(FRACTIONAL_INDEX_BACKFILL_FLAG_KEY, "done");
  } catch {
    localStorage.setItem(FRACTIONAL_INDEX_BACKFILL_FLAG_KEY, "done");
  }
}

/** Sets `createdAt = updatedAt` on legacy block rows that predate the field. */
export function backfillBlockCreatedAt(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (localStorage.getItem(BLOCK_CREATED_AT_BACKFILL_FLAG_KEY) === "done") {
    return;
  }

  try {
    const shardKeys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(BLOCK_SHARD_PREFIX)) {
        shardKeys.push(key);
      }
    }

    for (const key of shardKeys) {
      backfillShardCreatedAt(key);
    }

    localStorage.setItem(BLOCK_CREATED_AT_BACKFILL_FLAG_KEY, "done");
  } catch {
    localStorage.setItem(BLOCK_CREATED_AT_BACKFILL_FLAG_KEY, "done");
  }
}
