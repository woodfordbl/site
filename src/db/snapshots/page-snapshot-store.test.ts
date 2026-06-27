import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PageSnapshotContent,
  PageSnapshotDescriptor,
  PageSnapshotIndex,
} from "@/lib/pages/page-snapshot-types.ts";

const store = new Map<string, unknown>();

vi.mock("idb-keyval", () => ({
  createStore: () => "mock-store",
  get: (key: string) => Promise.resolve(store.get(key)),
  set: (key: string, value: unknown) => {
    store.set(key, value);
    return Promise.resolve();
  },
  del: (key: string) => {
    store.delete(key);
    return Promise.resolve();
  },
  keys: () => Promise.resolve([...store.keys()]),
}));

function descriptor(id: string): PageSnapshotDescriptor {
  return {
    id,
    bucketId: 1,
    timestamp: "2026-06-01T00:00:00.000Z",
    contentHash: "c",
    metadataHash: "m",
    blockCount: 1,
    wordCount: 1,
    title: "Notes",
  };
}

function content(id: string): PageSnapshotContent {
  return {
    id,
    blocks: [],
    blockOrder: [],
    title: "Notes",
    settings: {},
  };
}

describe("page-snapshot-store", () => {
  beforeEach(() => {
    vi.stubGlobal("indexedDB", {});
    store.clear();
  });

  it("keeps the index and content payloads in separate keys", async () => {
    const mod = await import("@/db/snapshots/page-snapshot-store.ts");
    await mod.writeSnapshotContent("page-1", content("snap-a"));
    await mod.writeSnapshotIndex({
      pageId: "page-1",
      descriptors: [descriptor("snap-a")],
    });

    expect([...store.keys()]).toEqual(
      expect.arrayContaining(["page-1:index", "page-1:snap:snap-a"])
    );

    const index = await mod.readSnapshotIndex("page-1");
    expect(index.descriptors).toHaveLength(1);
    const payload = await mod.readSnapshotContent("page-1", "snap-a");
    expect(payload?.id).toBe("snap-a");
  });

  it("clears all content keys and the index for a page", async () => {
    const mod = await import("@/db/snapshots/page-snapshot-store.ts");
    await mod.writeSnapshotContent("page-1", content("snap-a"));
    await mod.writeSnapshotContent("page-1", content("snap-b"));
    await mod.writeSnapshotIndex({
      pageId: "page-1",
      descriptors: [descriptor("snap-a"), descriptor("snap-b")],
    });

    await mod.clearPageSnapshots("page-1");
    expect(store.size).toBe(0);
  });

  it("lists only page ids that have an index", async () => {
    const mod = await import("@/db/snapshots/page-snapshot-store.ts");
    await mod.writeSnapshotContent("page-1", content("snap-a"));
    await mod.writeSnapshotIndex({
      pageId: "page-1",
      descriptors: [descriptor("snap-a")],
    });
    await mod.writeSnapshotIndex({
      pageId: "page-2",
      descriptors: [],
    } satisfies PageSnapshotIndex);

    const ids = await mod.listSnapshotPageIds();
    expect(ids.sort()).toEqual(["page-1", "page-2"]);
  });

  it("returns an empty index for an unknown page", async () => {
    const mod = await import("@/db/snapshots/page-snapshot-store.ts");
    const index = await mod.readSnapshotIndex("missing");
    expect(index).toEqual({ pageId: "missing", descriptors: [] });
  });
});
