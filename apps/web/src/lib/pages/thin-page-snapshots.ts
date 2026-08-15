import {
  MAX_SNAPSHOTS_PER_PAGE,
  type PageSnapshotDescriptor,
  SNAPSHOT_BUCKET_MS,
} from "@/lib/pages/page-snapshot-types.ts";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 604_800_000;
const MONTH_MS = 30 * DAY_MS;

export interface ThinSnapshotsResult {
  drop: PageSnapshotDescriptor[];
  keep: PageSnapshotDescriptor[];
}

/**
 * Coarse window width for a checkpoint based on its age: recent history stays
 * fine-grained, older history collapses to one checkpoint per ever-larger window.
 */
function tierWidthForAge(ageMs: number): number {
  if (ageMs < HOUR_MS) {
    return SNAPSHOT_BUCKET_MS; // last hour: every 10-min bucket
  }
  if (ageMs < DAY_MS) {
    return HOUR_MS; // 1–24h: hourly
  }
  if (ageMs < MONTH_MS) {
    return DAY_MS; // 24h–30d: daily
  }
  return WEEK_MS; // 30d+: weekly
}

/**
 * Tiered "coarsen over time" retention. Given the descriptor list and the
 * current clock, collapses each coarse window to its newest checkpoint, then
 * enforces a hard per-page cap (recency-biased). The single most-recent
 * checkpoint is always kept. Pinned checkpoints (pre-merge/pre-restore escape
 * hatches) bypass window collapsing — a forced checkpoint shares its 10-minute
 * window with the very next capture, which would otherwise immediately reclaim
 * it — but still count toward (and can be dropped by) the hard cap, so they
 * age out. Pure — no IndexedDB.
 */
function collectWindowSurvivors(
  sorted: PageSnapshotDescriptor[],
  nowMs: number
): Set<PageSnapshotDescriptor> {
  // Newest checkpoint per coarse window wins (later entries overwrite).
  const byWindow = new Map<string, PageSnapshotDescriptor>();
  for (const descriptor of sorted) {
    if (descriptor.pinned) {
      continue; // kept unconditionally below, never occupies a window
    }
    const ts = Date.parse(descriptor.timestamp);
    const width = tierWidthForAge(nowMs - ts);
    byWindow.set(`${width}:${Math.floor(ts / width)}`, descriptor);
  }

  const keepSet = new Set(byWindow.values());
  for (const descriptor of sorted) {
    if (descriptor.pinned) {
      keepSet.add(descriptor);
    }
  }
  return keepSet;
}

export function thinSnapshotDescriptors(
  descriptors: PageSnapshotDescriptor[],
  nowMs: number
): ThinSnapshotsResult {
  if (descriptors.length === 0) {
    return { keep: [], drop: [] };
  }

  const sorted = [...descriptors].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
  );

  const keepSet = collectWindowSurvivors(sorted, nowMs);
  const mostRecent = sorted.at(-1);
  if (mostRecent) {
    keepSet.add(mostRecent);
  }

  // Hard cap: drop oldest survivors (never the most recent) until within bound.
  if (keepSet.size > MAX_SNAPSHOTS_PER_PAGE) {
    for (const descriptor of sorted) {
      if (keepSet.size <= MAX_SNAPSHOTS_PER_PAGE) {
        break;
      }
      if (descriptor === mostRecent) {
        continue;
      }
      keepSet.delete(descriptor);
    }
  }

  const keep: PageSnapshotDescriptor[] = [];
  const drop: PageSnapshotDescriptor[] = [];
  for (const descriptor of sorted) {
    if (keepSet.has(descriptor)) {
      keep.push(descriptor);
    } else {
      drop.push(descriptor);
    }
  }

  return { keep, drop };
}
