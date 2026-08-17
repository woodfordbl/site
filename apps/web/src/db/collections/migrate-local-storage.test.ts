// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
  backfillBlockFractionalIndexes,
  backfillPageCreatedAt,
  CREATED_AT_BACKFILL_FLAG_KEY,
  FRACTIONAL_INDEX_BACKFILL_FLAG_KEY,
  LEGACY_PAGES_KEY,
} from "@/db/collections/migrate-local-storage.ts";
import { blockShardStorageKey } from "@/db/collections/page-sharded-block-storage.ts";

describe("backfillPageCreatedAt", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("sets createdAt from updatedAt when missing", () => {
    localStorage.setItem(
      LEGACY_PAGES_KEY,
      JSON.stringify({
        "page-1": {
          data: {
            id: "page-1",
            slug: "/notes",
            title: "Notes",
            parentId: null,
            serverBaselineHash: null,
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          versionKey: "2026-01-01T00:00:00.000Z",
        },
      })
    );

    backfillPageCreatedAt();

    const stored = JSON.parse(
      localStorage.getItem(LEGACY_PAGES_KEY) ?? "{}"
    ) as Record<string, { data: { createdAt?: string; updatedAt?: string } }>;

    expect(stored["page-1"]?.data.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(localStorage.getItem(CREATED_AT_BACKFILL_FLAG_KEY)).toBe("done");
  });

  it("leaves records that already have createdAt unchanged", () => {
    localStorage.setItem(
      LEGACY_PAGES_KEY,
      JSON.stringify({
        "page-1": {
          data: {
            id: "page-1",
            slug: "/notes",
            title: "Notes",
            parentId: null,
            serverBaselineHash: null,
            createdAt: "2025-12-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          versionKey: "2026-01-01T00:00:00.000Z",
        },
      })
    );

    backfillPageCreatedAt();

    const stored = JSON.parse(
      localStorage.getItem(LEGACY_PAGES_KEY) ?? "{}"
    ) as Record<string, { data: { createdAt?: string } }>;

    expect(stored["page-1"]?.data.createdAt).toBe("2025-12-01T00:00:00.000Z");
  });

  it("runs only once", () => {
    localStorage.setItem(CREATED_AT_BACKFILL_FLAG_KEY, "done");
    localStorage.setItem(
      LEGACY_PAGES_KEY,
      JSON.stringify({
        "page-1": {
          data: {
            id: "page-1",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          versionKey: "2026-01-01T00:00:00.000Z",
        },
      })
    );

    backfillPageCreatedAt();

    const stored = JSON.parse(
      localStorage.getItem(LEGACY_PAGES_KEY) ?? "{}"
    ) as Record<string, { data: { createdAt?: string } }>;

    expect(stored["page-1"]?.data.createdAt).toBeUndefined();
  });
});

describe("backfillBlockFractionalIndexes", () => {
  afterEach(() => {
    localStorage.clear();
  });

  interface StoredBlock {
    fractionalIndex?: string;
    id: string;
    pageId: string;
    updatedAt: string;
  }

  function writeLocalPage(pageId: string, blockOrder?: string[]): void {
    localStorage.setItem(
      LEGACY_PAGES_KEY,
      JSON.stringify({
        [pageId]: {
          data: {
            id: pageId,
            slug: "/notes",
            title: "Notes",
            parentId: null,
            serverBaselineHash: null,
            blockOrder,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          versionKey: "2026-01-01T00:00:00.000Z",
        },
      })
    );
  }

  function writeShard(pageId: string, blocks: StoredBlock[]): void {
    const shard: Record<string, { data: StoredBlock; versionKey: string }> = {};
    for (const block of blocks) {
      shard[block.id] = { data: block, versionKey: block.updatedAt };
    }
    localStorage.setItem(blockShardStorageKey(pageId), JSON.stringify(shard));
  }

  function readShard(pageId: string): Map<string, StoredBlock> {
    const raw = localStorage.getItem(blockShardStorageKey(pageId)) ?? "{}";
    const shard = JSON.parse(raw) as Record<string, { data: StoredBlock }>;
    return new Map(
      Object.values(shard).map((stored) => [stored.data.id, stored.data])
    );
  }

  function storedBlock(id: string, fractionalIndex?: string): StoredBlock {
    return {
      id,
      pageId: "page-1",
      fractionalIndex,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
  }

  it("assigns increasing indexes in blockOrder order", () => {
    writeLocalPage("page-1", ["b", "a", "c"]);
    writeShard("page-1", [
      storedBlock("a"),
      storedBlock("b"),
      storedBlock("c"),
    ]);

    backfillBlockFractionalIndexes();

    const rows = readShard("page-1");
    const keys = ["b", "a", "c"].map(
      (id) => rows.get(id)?.fractionalIndex as string
    );
    for (const key of keys) {
      expect(typeof key).toBe("string");
    }
    expect(keys[0] < keys[1]).toBe(true);
    expect(keys[1] < keys[2]).toBe(true);
    expect(localStorage.getItem(FRACTIONAL_INDEX_BACKFILL_FLAG_KEY)).toBe(
      "done"
    );
  });

  it("appends keys for rows missing from blockOrder after the ordered ones", () => {
    writeLocalPage("page-1", ["a", "b"]);
    writeShard("page-1", [
      storedBlock("a"),
      storedBlock("b"),
      storedBlock("orphan-child"),
    ]);

    backfillBlockFractionalIndexes();

    const rows = readShard("page-1");
    const orphanKey = rows.get("orphan-child")?.fractionalIndex as string;
    expect(typeof orphanKey).toBe("string");
    expect(orphanKey > (rows.get("b")?.fractionalIndex as string)).toBe(true);
  });

  it("keeps consistent existing indexes and fills only the missing ones", () => {
    writeLocalPage("page-1", ["a", "b", "c"]);
    writeShard("page-1", [
      storedBlock("a", "a0"),
      storedBlock("b"),
      storedBlock("c", "a1"),
    ]);

    backfillBlockFractionalIndexes();

    const rows = readShard("page-1");
    expect(rows.get("a")?.fractionalIndex).toBe("a0");
    expect(rows.get("c")?.fractionalIndex).toBe("a1");
    const filled = rows.get("b")?.fractionalIndex as string;
    expect(filled > "a0" && filled < "a1").toBe(true);
  });

  it("leaves fully indexed shards untouched", () => {
    writeLocalPage("page-1", ["a", "b"]);
    writeShard("page-1", [storedBlock("a", "a0"), storedBlock("b", "a1")]);
    const before = localStorage.getItem(blockShardStorageKey("page-1"));

    backfillBlockFractionalIndexes();

    expect(localStorage.getItem(blockShardStorageKey("page-1"))).toBe(before);
  });

  it("runs only once", () => {
    localStorage.setItem(FRACTIONAL_INDEX_BACKFILL_FLAG_KEY, "done");
    writeLocalPage("page-1", ["a"]);
    writeShard("page-1", [storedBlock("a")]);

    backfillBlockFractionalIndexes();

    expect(readShard("page-1").get("a")?.fractionalIndex).toBeUndefined();
  });
});
