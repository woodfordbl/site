import { createStore, del, get, keys, set } from "idb-keyval";

import type { Block } from "@/lib/schemas/block.ts";

/**
 * Server-baseline content for a lazy-seeded shipped page — the common ancestor
 * for conflict resolution. `serverBaselineHash` on the local page metadata only
 * proves the shipped content diverged; this store keeps the actual blocks the
 * overlay was seeded from so a future three-way merge (and today's conflict
 * preview) has real base content to work with.
 *
 * Lives in the same IndexedDB store as page snapshots under a reserved
 * `${pageId}:baseline` key. Written once at lazy-seed, replaced on
 * "keep my version" fast-forward, cleared with the overlay (reset / save-all)
 * and by the boot purge when the overlay is gone.
 */
export interface PageBaselineContent {
  blocks: Block[];
  capturedAt: string;
  /** `hashPageBlocks(blocks)` — matches `serverBaselineHash` on the local page. */
  contentHash: string;
}

const baselineStore = createStore("site-page-snapshots", "snapshots");

const BASELINE_SUFFIX = ":baseline";

function baselineKey(pageId: string): string {
  return `${pageId}${BASELINE_SUFFIX}`;
}

function isUnavailable(): boolean {
  return typeof indexedDB === "undefined";
}

export async function writePageBaseline(
  pageId: string,
  content: PageBaselineContent
): Promise<void> {
  if (isUnavailable()) {
    return;
  }
  await set(baselineKey(pageId), content, baselineStore);
}

export function readPageBaseline(
  pageId: string
): Promise<PageBaselineContent | undefined> {
  if (isUnavailable()) {
    return Promise.resolve(undefined);
  }
  return get<PageBaselineContent>(baselineKey(pageId), baselineStore);
}

export async function clearPageBaseline(pageId: string): Promise<void> {
  if (isUnavailable()) {
    return;
  }
  await del(baselineKey(pageId), baselineStore);
}

/** All page ids that currently have a stored baseline (for the boot purge). */
export async function listBaselinePageIds(): Promise<string[]> {
  if (isUnavailable()) {
    return [];
  }
  const allKeys = (await keys(baselineStore)) as string[];
  return allKeys
    .filter((key) => key.endsWith(BASELINE_SUFFIX))
    .map((key) => key.slice(0, -BASELINE_SUFFIX.length));
}

/**
 * Fire-and-forget baseline capture for the lazy-seed hot paths — IndexedDB
 * writes must never block or fail a local edit.
 */
export function capturePageBaseline(
  pageId: string,
  blocks: Block[],
  contentHash: string
): void {
  writePageBaseline(pageId, {
    blocks,
    contentHash,
    capturedAt: new Date().toISOString(),
  }).catch(() => undefined);
}
