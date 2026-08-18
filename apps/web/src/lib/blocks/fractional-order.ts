/**
 * @fileoverview Pure fractional-index ordering for page blocks.
 *
 * The durable document order is the per-block `fractionalIndex` key
 * (`fractional-indexing` order key): rows sort lexicographically by key, so a
 * move touches only the moved rows instead of rewriting a page-level order
 * array. {@link assignFractionalIndexes} computes the minimal set of new keys
 * for an order transition, and {@link sortByFractionalIndex} is the read-side
 * sort with a legacy `blockOrder` fallback for rows that predate the key.
 *
 * Invariants: assigned keys always sort strictly between their kept
 * neighbors' keys; blocks that stayed in sequence with consistent keys are
 * never reassigned; corrupt or out-of-order stored keys trigger a renumber of
 * the smallest suffix that restores consistency — or the whole page when the
 * stored keys are unusable (correctness over minimality).
 */
import { generateNKeysBetween } from "fractional-indexing";

/**
 * Indices of one longest strictly-increasing subsequence of `values`
 * (patience sorting with predecessor links, O(n log n)).
 */
function longestIncreasingSubsequence<T>(
  values: T[],
  lessThan: (a: T, b: T) => boolean
): number[] {
  const tailIndexes: number[] = [];
  const predecessors = new Array<number>(values.length).fill(-1);

  for (let index = 0; index < values.length; index++) {
    let low = 0;
    let high = tailIndexes.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (lessThan(values[tailIndexes[mid]], values[index])) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    predecessors[index] = low > 0 ? tailIndexes[low - 1] : -1;
    tailIndexes[low] = index;
  }

  const result: number[] = [];
  let cursor = tailIndexes.at(-1) ?? -1;
  while (cursor !== -1) {
    result.push(cursor);
    cursor = predecessors[cursor];
  }
  return result.reverse();
}

/**
 * Ids in `nextOrder` whose existing keys can be kept: they stayed in sequence
 * relative to `previousOrder` AND their kept keys still sort strictly
 * increasing. Everything else must be reassigned.
 */
function selectKeptKeys(
  previousOrder: string[],
  previousIndexById: ReadonlyMap<string, string | undefined>,
  nextOrder: string[]
): Map<string, string> {
  const previousPosition = new Map(
    previousOrder.map((id, index) => [id, index])
  );

  const candidates: Array<{ id: string; key: string; position: number }> = [];
  for (const id of nextOrder) {
    const position = previousPosition.get(id);
    const key = previousIndexById.get(id);
    if (position !== undefined && key !== undefined) {
      candidates.push({ id, key, position });
    }
  }

  // Position-stable subset: relative order unchanged between previous and next.
  const stable = longestIncreasingSubsequence(
    candidates.map((candidate) => candidate.position),
    (a, b) => a < b
  ).map((index) => candidates[index]);

  // Key-consistent subset: kept keys must sort strictly increasing.
  const kept = longestIncreasingSubsequence(
    stable.map((candidate) => candidate.key),
    (a, b) => a < b
  ).map((index) => stable[index]);

  return new Map(kept.map((candidate) => [candidate.id, candidate.key]));
}

/** New keys for every run of ids in `nextOrder` without a kept key. */
function fillRunsBetweenKeptKeys(
  nextOrder: string[],
  keptKeyById: ReadonlyMap<string, string>
): Map<string, string> {
  const assignments = new Map<string, string>();
  let index = 0;

  while (index < nextOrder.length) {
    if (keptKeyById.has(nextOrder[index])) {
      index += 1;
      continue;
    }

    let runEnd = index;
    while (runEnd < nextOrder.length && !keptKeyById.has(nextOrder[runEnd])) {
      runEnd += 1;
    }

    const leftKey =
      index > 0 ? (keptKeyById.get(nextOrder[index - 1]) ?? null) : null;
    const rightKey =
      runEnd < nextOrder.length
        ? (keptKeyById.get(nextOrder[runEnd]) ?? null)
        : null;

    const keys = generateNKeysBetween(leftKey, rightKey, runEnd - index);
    for (let cursor = index; cursor < runEnd; cursor++) {
      assignments.set(nextOrder[cursor], keys[cursor - index]);
    }
    index = runEnd;
  }

  return assignments;
}

/**
 * Computes the fractional indexes required to realize `nextOrder`, given the
 * previous document order and each block's stored index. Returns new keys
 * ONLY for blocks whose position changed or that lack a (usable) key —
 * unchanged in-sequence blocks keep their stored key and are absent from the
 * result. Stored keys that are mutually inconsistent (out of lexicographic
 * order, duplicated) are treated as missing and reassigned; keys the
 * generator rejects as malformed trigger a whole-page renumber.
 */
export function assignFractionalIndexes(
  previousOrder: string[],
  previousIndexById: ReadonlyMap<string, string | undefined>,
  nextOrder: string[]
): Map<string, string> {
  if (nextOrder.length === 0) {
    return new Map();
  }

  const kept = selectKeptKeys(previousOrder, previousIndexById, nextOrder);
  try {
    return fillRunsBetweenKeptKeys(nextOrder, kept);
  } catch {
    // A kept key was malformed enough for the generator to reject it —
    // renumber the entire page from scratch.
    const keys = generateNKeysBetween(null, null, nextOrder.length);
    return new Map(nextOrder.map((id, index) => [id, keys[index]]));
  }
}

interface FractionallyOrdered {
  fractionalIndex?: string;
  id: string;
}

/** Lexicographic key order; deterministic tiebreak by id for equal keys. */
function compareByIndexThenId(
  a: FractionallyOrdered,
  b: FractionallyOrdered
): number {
  const aKey = a.fractionalIndex as string;
  const bKey = b.fractionalIndex as string;
  if (aKey < bKey) {
    return -1;
  }
  if (aKey > bKey) {
    return 1;
  }
  if (a.id < b.id) {
    return -1;
  }
  return a.id > b.id ? 1 : 0;
}

/** Index in `placed` directly after `id`'s nearest placed `fallbackOrder` predecessor (0 when none). */
function fallbackInsertionIndex(
  placed: FractionallyOrdered[],
  fallbackOrder: string[],
  fallbackPosition: number
): number {
  for (let cursor = fallbackPosition - 1; cursor >= 0; cursor--) {
    const predecessorId = fallbackOrder[cursor];
    const placedIndex = placed.findIndex((row) => row.id === predecessorId);
    if (placedIndex !== -1) {
      return placedIndex + 1;
    }
  }
  return 0;
}

/**
 * Read-side document order: rows with a `fractionalIndex` sort
 * lexicographically by key (id tiebreak); rows without one are placed at the
 * position implied by `fallbackOrder` (the page's legacy `blockOrder`
 * mirror), and rows in neither are appended last in input order — matching
 * the legacy `orderBlocksByIds` behavior for fully un-migrated pages.
 */
export function sortByFractionalIndex<T extends FractionallyOrdered>(
  blocks: T[],
  fallbackOrder?: string[]
): T[] {
  const indexed: T[] = [];
  const unindexed: T[] = [];
  for (const block of blocks) {
    (block.fractionalIndex === undefined ? unindexed : indexed).push(block);
  }

  const result = [...indexed].sort(compareByIndexThenId);
  if (unindexed.length === 0) {
    return result;
  }

  const fallback = fallbackOrder ?? [];
  const fallbackPositionById = new Map(
    fallback.map((id, index) => [id, index])
  );

  const inFallback = unindexed
    .filter((block) => fallbackPositionById.has(block.id))
    .sort(
      (a, b) =>
        (fallbackPositionById.get(a.id) as number) -
        (fallbackPositionById.get(b.id) as number)
    );
  const appended = unindexed.filter(
    (block) => !fallbackPositionById.has(block.id)
  );

  for (const block of inFallback) {
    const position = fallbackPositionById.get(block.id) as number;
    result.splice(fallbackInsertionIndex(result, fallback, position), 0, block);
  }

  return [...result, ...appended];
}
