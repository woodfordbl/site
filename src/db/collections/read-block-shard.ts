import { getBrowserStorage } from "@/db/collections/browser-storage.ts";
import { blockShardStorageKey } from "@/db/collections/page-sharded-block-storage.ts";
import {
  type LocalBlock,
  localBlockSchema,
} from "@/lib/schemas/local-block.ts";

interface StoredItem<T> {
  data: T;
  versionKey: string;
}

export function readBlockShardForPage(
  pageId: string,
  storage: Storage = getBrowserStorage()
): LocalBlock[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = storage.getItem(blockShardStorageKey(pageId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as Record<string, StoredItem<unknown>>;
    const blocks: LocalBlock[] = [];

    for (const stored of Object.values(parsed)) {
      const result = localBlockSchema.safeParse(stored.data);
      if (result.success) {
        blocks.push(result.data);
      }
    }

    return blocks;
  } catch {
    return [];
  }
}
