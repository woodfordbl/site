import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import { readLocalStorageCollection } from "@/db/collections/read-local-storage-sync.ts";
import { reportPersistenceError } from "@/db/persistence-errors.ts";
import {
  deleteSnapshotContent,
  readSnapshotIndex,
  writeSnapshotContent,
  writeSnapshotIndex,
} from "@/db/snapshots/page-snapshot-store.ts";
import { orderBlocksByIds } from "@/lib/blocks/order-blocks.ts";
import { hashPageBlocks } from "@/lib/content/block-hash.ts";
import { hashPageMetadata } from "@/lib/content/page-metadata-hash.ts";
import { bucketIdForTimestamp } from "@/lib/pages/page-snapshot-bucketing.ts";
import type {
  PageSnapshotContent,
  PageSnapshotDescriptor,
} from "@/lib/pages/page-snapshot-types.ts";
import { countPageWords } from "@/lib/pages/page-word-count.ts";
import { resolveSnapshotCaptureAction } from "@/lib/pages/resolve-snapshot-capture-action.ts";
import { thinSnapshotDescriptors } from "@/lib/pages/thin-page-snapshots.ts";
import { blocksFromLocalBlocks } from "@/lib/schemas/local-block.ts";
import { localPageSchema } from "@/lib/schemas/local-page.ts";

const LOCAL_PAGES_STORAGE_KEY = "site-local-pages";
const SNAPSHOT_CAPTURE_DEBOUNCE_MS = 10_000;

const captureTimers = new Map<string, ReturnType<typeof setTimeout>>();

interface CaptureInputs {
  content: PageSnapshotContent;
  descriptor: Omit<PageSnapshotDescriptor, "id">;
}

/** Reads the current local page state synchronously (no React, no TanStack DB). */
function readCaptureInputs(
  pageId: string,
  nowMs: number
): CaptureInputs | null {
  const localPage =
    readLocalStorageCollection(LOCAL_PAGES_STORAGE_KEY, localPageSchema).find(
      (page) => page.id === pageId
    ) ?? null;

  // Only locally-edited pages have something to snapshot.
  if (!localPage) {
    return null;
  }

  const localBlocks = readBlockShardForPage(pageId);
  const blocks = orderBlocksByIds(
    blocksFromLocalBlocks(localBlocks),
    localPage.blockOrder
  );
  const blockOrder = blocks.map((block) => block.id);

  const content: PageSnapshotContent = {
    id: "", // assigned by the capture action
    blocks,
    blockOrder,
    title: localPage.title,
    icon: localPage.icon,
    settings: { font: localPage.font, smallText: localPage.smallText },
  };

  const descriptor: Omit<PageSnapshotDescriptor, "id"> = {
    bucketId: bucketIdForTimestamp(nowMs),
    timestamp: new Date(nowMs).toISOString(),
    contentHash: hashPageBlocks(blocks),
    metadataHash: hashPageMetadata({
      font: localPage.font,
      icon: localPage.icon,
      parentId: localPage.parentId,
      sidebarOrder: localPage.sidebarOrder,
      slug: localPage.slug,
      smallText: localPage.smallText,
      title: localPage.title,
    }),
    blockCount: blocks.length,
    wordCount: countPageWords(blocks),
    title: localPage.title,
  };

  return { content, descriptor };
}

/**
 * Captures (or coalesces into the current 10-minute bucket) a checkpoint of the
 * page's current state, then applies tiered retention. Best-effort: failures are
 * reported but never thrown, so snapshotting never blocks an edit.
 *
 * @param force when true, always creates a distinct checkpoint (used pre-restore
 *   so a revert is itself undoable).
 */
export async function capturePageSnapshotNow(
  pageId: string,
  options?: { force?: boolean }
): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return;
  }

  try {
    const nowMs = Date.now();
    const inputs = readCaptureInputs(pageId, nowMs);
    if (!inputs) {
      return;
    }

    const index = await readSnapshotIndex(pageId);
    const newId = crypto.randomUUID();
    const action = options?.force
      ? ({
          kind: "create",
          descriptor: { ...inputs.descriptor, id: newId },
        } as const)
      : resolveSnapshotCaptureAction(index, inputs.descriptor, newId);

    if (action.kind === "skip") {
      return;
    }

    const descriptors = index.descriptors.filter(
      (existing) => existing.id !== action.descriptor.id
    );
    descriptors.push(action.descriptor);
    descriptors.sort(
      (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
    );

    const { keep, drop } = thinSnapshotDescriptors(descriptors, nowMs);

    // Write the content before the index so the index never points at a missing
    // payload; the new checkpoint is always retained (most-recent rule).
    await writeSnapshotContent(pageId, {
      ...inputs.content,
      id: action.descriptor.id,
    });
    await Promise.all(
      drop.map((descriptor) => deleteSnapshotContent(pageId, descriptor.id))
    );
    await writeSnapshotIndex({ pageId, descriptors: keep });
  } catch (error) {
    reportPersistenceError(error);
  }
}

/** Debounced capture: coalesces a burst of edits into one checkpoint write. */
export function schedulePageSnapshotCapture(pageId: string): void {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return;
  }

  const existing = captureTimers.get(pageId);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    captureTimers.delete(pageId);
    capturePageSnapshotNow(pageId).catch(reportPersistenceError);
  }, SNAPSHOT_CAPTURE_DEBOUNCE_MS);

  captureTimers.set(pageId, timer);
}
