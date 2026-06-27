import { readLocalStorageCollection } from "@/db/collections/read-local-storage-sync.ts";
import {
  clearPageSnapshots,
  deleteSnapshotContent,
  listSnapshotPageIds,
  readSnapshotIndex,
  writeSnapshotIndex,
} from "@/db/snapshots/page-snapshot-store.ts";
import { thinSnapshotDescriptors } from "@/lib/pages/thin-page-snapshots.ts";
import { localPageSchema } from "@/lib/schemas/local-page.ts";

const LOCAL_PAGES_STORAGE_KEY = "site-local-pages";

async function purgePageSnapshots(
  pageId: string,
  localPageIds: Set<string>,
  nowMs: number
): Promise<void> {
  // Drop snapshots for pages whose local data is gone (missed lifecycle clear).
  if (!localPageIds.has(pageId)) {
    await clearPageSnapshots(pageId);
    return;
  }

  const index = await readSnapshotIndex(pageId);
  const { keep, drop } = thinSnapshotDescriptors(index.descriptors, nowMs);
  if (drop.length === 0) {
    return;
  }

  await Promise.all(
    drop.map((descriptor) => deleteSnapshotContent(pageId, descriptor.id))
  );
  await writeSnapshotIndex({ pageId, descriptors: keep });
}

/** Applies tiered retention to every page's snapshot history. */
export async function purgeAllSnapshots(): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return;
  }

  const pageIds = await listSnapshotPageIds();
  if (pageIds.length === 0) {
    return;
  }

  const localPageIds = new Set(
    readLocalStorageCollection(LOCAL_PAGES_STORAGE_KEY, localPageSchema).map(
      (page) => page.id
    )
  );
  const nowMs = Date.now();

  for (const pageId of pageIds) {
    try {
      await purgePageSnapshots(pageId, localPageIds, nowMs);
    } catch {
      // One bad page must not abort the sweep.
    }
  }
}

/** Reclaim over-retained snapshots once per boot, off the critical path. */
export function scheduleSnapshotPurge(): void {
  const run = () => {
    purgeAllSnapshots().catch(() => undefined);
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 30_000 });
    return;
  }
  window.setTimeout(run, 10_000);
}
