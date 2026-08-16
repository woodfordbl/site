import { BLOCK_SHARD_PREFIX } from "@/db/collections/page-sharded-block-storage.ts";
import { readLocalStorageCollection } from "@/db/collections/read-local-storage-sync.ts";
import {
  readDirtyPageIdsFromDocument,
  writeDirtyPageIdsToDocument,
} from "@/lib/local-draft/dirty-pages-cookie.ts";
import { localPageSchema } from "@/lib/schemas/local-page.ts";

const LOCAL_PAGES_STORAGE_KEY = "site-local-pages";

function readLocalDraftPageIdsFromStorage(): Set<string> {
  const pageIds = new Set<string>();

  for (const page of readLocalStorageCollection(
    LOCAL_PAGES_STORAGE_KEY,
    localPageSchema
  )) {
    pageIds.add(page.id);
  }

  if (typeof window === "undefined") {
    return pageIds;
  }

  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key?.startsWith(BLOCK_SHARD_PREFIX)) {
      continue;
    }

    pageIds.add(key.slice(BLOCK_SHARD_PREFIX.length));
  }

  return pageIds;
}

function setsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

export function reconcileDirtyPagesCookie(): void {
  if (typeof window === "undefined") {
    return;
  }

  const storageIds = readLocalDraftPageIdsFromStorage();
  const cookieIds = readDirtyPageIdsFromDocument();

  if (setsEqual(storageIds, cookieIds)) {
    return;
  }

  writeDirtyPageIdsToDocument(storageIds);
}
