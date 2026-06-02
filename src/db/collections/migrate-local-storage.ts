import { blockShardStorageKey } from "@/db/collections/page-sharded-block-storage.ts";
import type { Block } from "@/lib/schemas/block.ts";
import { toLocalBlock } from "@/lib/schemas/local-block.ts";
import {
  legacyLocalPageSchema,
  localPageSchema,
} from "@/lib/schemas/local-page.ts";

const LEGACY_PAGES_KEY = "site-local-pages";
const MIGRATION_FLAG_KEY = "site-local-storage-v2";
const CREATED_AT_BACKFILL_FLAG_KEY = "site-local-pages-created-at-backfill";

export { CREATED_AT_BACKFILL_FLAG_KEY, LEGACY_PAGES_KEY };

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
