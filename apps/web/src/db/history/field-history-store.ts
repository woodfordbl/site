import { createStore, del, get, keys, set } from "idb-keyval";

import type { FieldHistoryPoint } from "@/db/history/field-history-types.ts";
import { thinFieldHistory } from "@/db/history/thin-field-history.ts";

/**
 * Forward-only field-history store: per (database, row, field) `{ t, v }`
 * series persisted to IndexedDB, powering time-axis charts. Mirrors
 * `page-snapshot-store.ts` (idb-keyval, `isUnavailable` SSR guard).
 *
 * An in-memory cache is authoritative once a key is hydrated: appends mutate it
 * synchronously and reads return from it, so the ~4/sec coalesced tick flushes
 * never race a read-modify-write against IndexedDB. Persistence is debounced —
 * a single `set` per dirty key after a quiet window.
 */

const historyStore = createStore("site-field-history", "series");

/** Delay before flushing dirty series to IndexedDB (batches burst writes). */
const PERSIST_DEBOUNCE_MS = 1000;

const cache = new Map<string, FieldHistoryPoint[]>();
const hydrated = new Set<string>();
const hydrating = new Map<string, Promise<void>>();
const dirty = new Set<string>();
let persistTimer: ReturnType<typeof setTimeout> | undefined;

/** One entry to append (a single sampled value at time `t`). */
export interface FieldHistoryAppend {
  databaseId: string;
  externalId: string;
  fieldId: string;
  t: number;
  v: number;
}

function isUnavailable(): boolean {
  return typeof indexedDB === "undefined";
}

function seriesKey(
  databaseId: string,
  externalId: string,
  fieldId: string
): string {
  return `${databaseId}:${externalId}:${fieldId}`;
}

/** Load a key's series from IndexedDB into the cache once (idempotent). */
function hydrate(key: string): Promise<void> {
  if (hydrated.has(key)) {
    return Promise.resolve();
  }
  const existing = hydrating.get(key);
  if (existing) {
    return existing;
  }
  const pending = get<FieldHistoryPoint[]>(key, historyStore)
    .then((stored) => {
      // Don't clobber values appended while the read was in flight.
      if (!cache.has(key)) {
        cache.set(key, stored ?? []);
      }
      hydrated.add(key);
      hydrating.delete(key);
    })
    .catch(() => {
      cache.set(key, cache.get(key) ?? []);
      hydrated.add(key);
      hydrating.delete(key);
    });
  hydrating.set(key, pending);
  return pending;
}

function schedulePersist(): void {
  if (persistTimer !== undefined) {
    return;
  }
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    persistDirty().catch(() => undefined);
  }, PERSIST_DEBOUNCE_MS);
}

async function persistDirty(): Promise<void> {
  const pending = [...dirty];
  dirty.clear();
  await Promise.all(
    pending.map((key) => set(key, cache.get(key) ?? [], historyStore))
  );
}

/**
 * Append sampled values to their series. Forward-only and value-deduped: a
 * point is dropped if it isn't newer than the last recorded one, or if its
 * value equals the last recorded value (flat stretches collapse). Series are
 * thinned after each append. Safe to call fire-and-forget.
 */
export async function appendFieldHistory(
  entries: FieldHistoryAppend[]
): Promise<void> {
  if (isUnavailable() || entries.length === 0) {
    return;
  }

  const byKey = new Map<string, FieldHistoryPoint[]>();
  for (const entry of entries) {
    if (!Number.isFinite(entry.v)) {
      continue;
    }
    const key = seriesKey(entry.databaseId, entry.externalId, entry.fieldId);
    const points = byKey.get(key) ?? [];
    points.push({ t: entry.t, v: entry.v });
    byKey.set(key, points);
  }

  const nowMs = Date.now();
  await Promise.all(
    [...byKey].map(async ([key, incoming]) => {
      await hydrate(key);
      const series = cache.get(key) ?? [];
      let changed = false;
      for (const point of incoming.sort((a, b) => a.t - b.t)) {
        const last = series.at(-1);
        if (last && (point.t < last.t || last.v === point.v)) {
          continue; // Out-of-order or unchanged — skip.
        }
        series.push(point);
        changed = true;
      }
      if (changed) {
        cache.set(key, thinFieldHistory(series, nowMs));
        dirty.add(key);
      }
    })
  );

  if (dirty.size > 0) {
    schedulePersist();
  }
}

/** Read one series (from the in-memory cache once hydrated). Returns a copy. */
export async function readFieldHistory(
  databaseId: string,
  externalId: string,
  fieldId: string
): Promise<FieldHistoryPoint[]> {
  if (isUnavailable()) {
    return [];
  }
  const key = seriesKey(databaseId, externalId, fieldId);
  await hydrate(key);
  return [...(cache.get(key) ?? [])];
}

/**
 * Sync peek at an already-hydrated series (empty when missing / not yet loaded).
 * Used by derived live-markets metrics after {@link ensureSeriesCoverageMany} has
 * warmed the cache — never triggers IndexedDB IO.
 */
export function peekFieldHistory(
  databaseId: string,
  externalId: string,
  fieldId: string
): FieldHistoryPoint[] {
  if (isUnavailable()) {
    return [];
  }
  const key = seriesKey(databaseId, externalId, fieldId);
  if (!hydrated.has(key)) {
    return [];
  }
  return [...(cache.get(key) ?? [])];
}

/** One batch of historical points to merge into a series (any age order). */
export interface FieldHistoryMerge {
  databaseId: string;
  externalId: string;
  fieldId: string;
  points: readonly FieldHistoryPoint[];
}

/**
 * Merge historical (backfill) points into series. Unlike
 * {@link appendFieldHistory}, older-than-latest points are kept — candles sit
 * under live ticks. Same-`t` collisions prefer the incoming value; the merged
 * series is thinned afterward. Safe to call fire-and-forget.
 */
export async function mergeFieldHistory(
  batches: readonly FieldHistoryMerge[]
): Promise<void> {
  if (isUnavailable() || batches.length === 0) {
    return;
  }

  const nowMs = Date.now();
  await Promise.all(
    batches.map(async (batch) => {
      const finite = batch.points.filter(
        (point) => Number.isFinite(point.t) && Number.isFinite(point.v)
      );
      if (finite.length === 0) {
        return;
      }
      const key = seriesKey(batch.databaseId, batch.externalId, batch.fieldId);
      await hydrate(key);
      const existing = cache.get(key) ?? [];
      const byT = new Map<number, FieldHistoryPoint>();
      for (const point of existing) {
        byT.set(point.t, point);
      }
      for (const point of finite) {
        byT.set(point.t, point);
      }
      const merged = [...byT.values()].sort((a, b) => a.t - b.t);
      cache.set(key, thinFieldHistory(merged, nowMs));
      dirty.add(key);
    })
  );

  if (dirty.size > 0) {
    schedulePersist();
  }
}

/** Delete every series belonging to a database (used when it's removed). */
export async function clearDatabaseFieldHistory(
  databaseId: string
): Promise<void> {
  if (isUnavailable()) {
    return;
  }
  const prefix = `${databaseId}:`;
  const allKeys = (await keys(historyStore)) as string[];
  await Promise.all(
    allKeys
      .filter((key) => key.startsWith(prefix))
      .map(async (key) => {
        cache.delete(key);
        hydrated.delete(key);
        dirty.delete(key);
        await del(key, historyStore);
      })
  );
}
