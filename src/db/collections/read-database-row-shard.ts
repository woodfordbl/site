import { getBrowserStorage } from "@/db/collections/browser-storage.ts";
import { databaseRowShardStorageKey } from "@/db/collections/database-sharded-row-storage.ts";
import {
  type LocalDatabaseRow,
  localDatabaseRowSchema,
} from "@/lib/schemas/database.ts";

interface StoredItem<T> {
  data: T;
  versionKey: string;
}

/** Synchronous read of one database's row shard (mirror of `readBlockShardForPage`). */
export function readDatabaseRowShard(
  databaseId: string,
  storage: Storage = getBrowserStorage()
): LocalDatabaseRow[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = storage.getItem(databaseRowShardStorageKey(databaseId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as Record<string, StoredItem<unknown>>;
    const rows: LocalDatabaseRow[] = [];

    for (const stored of Object.values(parsed)) {
      const result = localDatabaseRowSchema.safeParse(stored.data);
      if (result.success) {
        rows.push(result.data);
      }
    }

    return rows;
  } catch {
    return [];
  }
}
