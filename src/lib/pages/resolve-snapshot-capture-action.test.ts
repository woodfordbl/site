import { describe, expect, it } from "vitest";

import type {
  PageSnapshotDescriptor,
  PageSnapshotIndex,
} from "@/lib/pages/page-snapshot-types.ts";
import { resolveSnapshotCaptureAction } from "@/lib/pages/resolve-snapshot-capture-action.ts";

function descriptor(
  overrides: Partial<PageSnapshotDescriptor>
): PageSnapshotDescriptor {
  return {
    id: "snap-1",
    bucketId: 100,
    timestamp: "2026-06-01T00:00:00.000Z",
    contentHash: "aaaa",
    metadataHash: "bbbb",
    blockCount: 3,
    wordCount: 10,
    title: "Notes",
    ...overrides,
  };
}

function indexOf(descriptors: PageSnapshotDescriptor[]): PageSnapshotIndex {
  return { pageId: "page-1", descriptors };
}

const candidate = (
  overrides: Partial<Omit<PageSnapshotDescriptor, "id">>
): Omit<PageSnapshotDescriptor, "id"> => {
  const { id: _id, ...rest } = descriptor(overrides);
  return rest;
};

describe("resolveSnapshotCaptureAction", () => {
  it("creates the first checkpoint when the index is empty", () => {
    const action = resolveSnapshotCaptureAction(
      indexOf([]),
      candidate({}),
      "new-id"
    );
    expect(action.kind).toBe("create");
  });

  it("skips when nothing changed within the same bucket", () => {
    const existing = descriptor({});
    const action = resolveSnapshotCaptureAction(
      indexOf([existing]),
      candidate({ contentHash: "aaaa", metadataHash: "bbbb" }),
      "new-id"
    );
    expect(action.kind).toBe("skip");
  });

  it("updates in place (reusing id) when content changes within the bucket", () => {
    const existing = descriptor({ id: "snap-1" });
    const action = resolveSnapshotCaptureAction(
      indexOf([existing]),
      candidate({ contentHash: "cccc" }),
      "new-id"
    );
    expect(action.kind).toBe("update");
    if (action.kind === "update") {
      expect(action.descriptor.id).toBe("snap-1");
      expect(action.descriptor.contentHash).toBe("cccc");
    }
  });

  it("creates a new checkpoint when the bucket advances and content changed", () => {
    const existing = descriptor({ bucketId: 100 });
    const action = resolveSnapshotCaptureAction(
      indexOf([existing]),
      candidate({ bucketId: 101, contentHash: "cccc" }),
      "new-id"
    );
    expect(action.kind).toBe("create");
    if (action.kind === "create") {
      expect(action.descriptor.id).toBe("new-id");
    }
  });

  it("skips a no-op edit that merely crossed a bucket boundary", () => {
    const existing = descriptor({ bucketId: 100 });
    const action = resolveSnapshotCaptureAction(
      indexOf([existing]),
      candidate({ bucketId: 101, contentHash: "aaaa", metadataHash: "bbbb" }),
      "new-id"
    );
    expect(action.kind).toBe("skip");
  });

  it("creates instead of coalescing over a pinned same-bucket checkpoint", () => {
    // A pre-merge escape hatch must survive the debounced post-merge capture
    // that lands in the same 10-minute bucket.
    const existing = descriptor({ pinned: true });
    const action = resolveSnapshotCaptureAction(
      indexOf([existing]),
      candidate({ contentHash: "cccc" }),
      "new-id"
    );
    expect(action.kind).toBe("create");
    if (action.kind === "create") {
      expect(action.descriptor.id).toBe("new-id");
      expect(action.descriptor.pinned).toBeUndefined();
    }
  });

  it("still skips an unchanged capture over a pinned checkpoint", () => {
    const existing = descriptor({ pinned: true });
    const action = resolveSnapshotCaptureAction(
      indexOf([existing]),
      candidate({ contentHash: "aaaa", metadataHash: "bbbb" }),
      "new-id"
    );
    expect(action.kind).toBe("skip");
  });
});
