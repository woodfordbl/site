import { describe, expect, it } from "vitest";

import {
  MAX_SNAPSHOTS_PER_PAGE,
  type PageSnapshotDescriptor,
  SNAPSHOT_BUCKET_MS,
} from "@/lib/pages/page-snapshot-types.ts";
import { thinSnapshotDescriptors } from "@/lib/pages/thin-page-snapshots.ts";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const NOW = Date.parse("2026-06-01T00:00:00.000Z");

function makeDescriptor(tsMs: number, index: number): PageSnapshotDescriptor {
  return {
    id: `snap-${index}`,
    bucketId: Math.floor(tsMs / SNAPSHOT_BUCKET_MS),
    timestamp: new Date(tsMs).toISOString(),
    contentHash: `c-${index}`,
    metadataHash: "m",
    blockCount: 1,
    wordCount: 1,
    title: "Notes",
  };
}

/** Every 10 minutes for the last `days` days, ascending by timestamp. */
function denseHistory(days: number): PageSnapshotDescriptor[] {
  const descriptors: PageSnapshotDescriptor[] = [];
  const count = (days * DAY_MS) / SNAPSHOT_BUCKET_MS;
  for (let step = count - 1; step >= 0; step -= 1) {
    descriptors.push(
      makeDescriptor(NOW - step * SNAPSHOT_BUCKET_MS, descriptors.length)
    );
  }
  return descriptors;
}

describe("thinSnapshotDescriptors", () => {
  it("returns empty for empty input", () => {
    expect(thinSnapshotDescriptors([], NOW)).toEqual({ keep: [], drop: [] });
  });

  it("keeps everything when each checkpoint is its own coarse window", () => {
    const descriptors = [
      makeDescriptor(NOW - 5 * DAY_MS, 0),
      makeDescriptor(NOW - 40 * DAY_MS, 1),
      makeDescriptor(NOW - 2 * HOUR_MS, 2),
    ];
    const { keep, drop } = thinSnapshotDescriptors(descriptors, NOW);
    expect(drop).toHaveLength(0);
    expect(keep).toHaveLength(3);
  });

  it("coarsens a dense 90-day history into tiered windows under the cap", () => {
    const { keep } = thinSnapshotDescriptors(denseHistory(90), NOW);

    // Never exceeds the hard cap.
    expect(keep.length).toBeLessThanOrEqual(MAX_SNAPSHOTS_PER_PAGE);

    // Ascending by timestamp.
    const times = keep.map((d) => Date.parse(d.timestamp));
    expect(times).toEqual([...times].sort((a, b) => a - b));

    // The most recent checkpoint is always kept.
    const newest = keep.at(-1);
    expect(newest).toBeDefined();
    expect(NOW - Date.parse(newest?.timestamp ?? "")).toBeLessThan(
      SNAPSHOT_BUCKET_MS
    );

    // Last hour keeps every 10-min bucket (6 of them: 0..50 min ago).
    const lastHour = keep.filter(
      (d) => NOW - Date.parse(d.timestamp) < HOUR_MS
    );
    expect(lastHour).toHaveLength(6);

    // No two survivors collapse into the same hour within the 1–24h tier.
    const hourBuckets = keep
      .filter((d) => {
        const age = NOW - Date.parse(d.timestamp);
        return age >= HOUR_MS && age < DAY_MS;
      })
      .map((d) => Math.floor(Date.parse(d.timestamp) / HOUR_MS));
    expect(new Set(hourBuckets).size).toBe(hourBuckets.length);
  });
});
