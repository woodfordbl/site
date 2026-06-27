import { createStore, del, get, keys, set } from "idb-keyval";

import type {
  PageSnapshotContent,
  PageSnapshotIndex,
} from "@/lib/pages/page-snapshot-types.ts";

const snapshotStore = createStore("site-page-snapshots", "snapshots");

const INDEX_SUFFIX = ":index";

function indexKey(pageId: string): string {
  return `${pageId}${INDEX_SUFFIX}`;
}

function contentKey(pageId: string, snapshotId: string): string {
  return `${pageId}:snap:${snapshotId}`;
}

function isUnavailable(): boolean {
  return typeof indexedDB === "undefined";
}

export async function readSnapshotIndex(
  pageId: string
): Promise<PageSnapshotIndex> {
  if (isUnavailable()) {
    return { pageId, descriptors: [] };
  }
  const stored = await get<PageSnapshotIndex>(indexKey(pageId), snapshotStore);
  return stored ?? { pageId, descriptors: [] };
}

export async function writeSnapshotIndex(
  index: PageSnapshotIndex
): Promise<void> {
  if (isUnavailable()) {
    return;
  }
  await set(indexKey(index.pageId), index, snapshotStore);
}

export function readSnapshotContent(
  pageId: string,
  snapshotId: string
): Promise<PageSnapshotContent | undefined> {
  if (isUnavailable()) {
    return Promise.resolve(undefined);
  }
  return get<PageSnapshotContent>(
    contentKey(pageId, snapshotId),
    snapshotStore
  );
}

export async function writeSnapshotContent(
  pageId: string,
  content: PageSnapshotContent
): Promise<void> {
  if (isUnavailable()) {
    return;
  }
  await set(contentKey(pageId, content.id), content, snapshotStore);
}

export async function deleteSnapshotContent(
  pageId: string,
  snapshotId: string
): Promise<void> {
  if (isUnavailable()) {
    return;
  }
  await del(contentKey(pageId, snapshotId), snapshotStore);
}

/** Removes a page's index and every checkpoint payload it references. */
export async function clearPageSnapshots(pageId: string): Promise<void> {
  if (isUnavailable()) {
    return;
  }
  const index = await readSnapshotIndex(pageId);
  await Promise.all(
    index.descriptors.map((descriptor) =>
      del(contentKey(pageId, descriptor.id), snapshotStore)
    )
  );
  await del(indexKey(pageId), snapshotStore);
}

/** All page ids that currently have a snapshot index (for the boot purge). */
export async function listSnapshotPageIds(): Promise<string[]> {
  if (isUnavailable()) {
    return [];
  }
  const allKeys = (await keys(snapshotStore)) as string[];
  return allKeys
    .filter((key) => key.endsWith(INDEX_SUFFIX))
    .map((key) => key.slice(0, -INDEX_SUFFIX.length));
}
