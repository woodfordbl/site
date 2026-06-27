import { describe, expect, it } from "vitest";

import { bucketIdForTimestamp } from "@/lib/pages/page-snapshot-bucketing.ts";
import { SNAPSHOT_BUCKET_MS } from "@/lib/pages/page-snapshot-types.ts";

describe("bucketIdForTimestamp", () => {
  it("groups instants within the same 10-minute window", () => {
    const base = 1000 * SNAPSHOT_BUCKET_MS;
    expect(bucketIdForTimestamp(base)).toBe(
      bucketIdForTimestamp(base + SNAPSHOT_BUCKET_MS - 1)
    );
  });

  it("increments across a window boundary", () => {
    const base = 1000 * SNAPSHOT_BUCKET_MS;
    expect(bucketIdForTimestamp(base + SNAPSHOT_BUCKET_MS)).toBe(
      bucketIdForTimestamp(base) + 1
    );
  });
});
