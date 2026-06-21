import { describe, expect, it } from "vitest";

import {
  BLOCK_QUARANTINE_KEY,
  createPageShardedBlockStorage,
} from "@/db/collections/page-sharded-block-storage.ts";

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

function storedBlock(id: string, pageId: string, text = id) {
  return {
    versionKey: `v-${id}`,
    data: {
      id,
      pageId,
      type: "text",
      props: { text },
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

function collectionValue(
  items: Record<string, ReturnType<typeof storedBlock>>
): string {
  return JSON.stringify(items);
}

describe("createPageShardedBlockStorage", () => {
  it("splits collection writes into per-page shards and merges them on read", () => {
    const storage = createMemoryStorage();
    const sharded = createPageShardedBlockStorage(storage);

    sharded.setItem(
      "site-local-blocks",
      collectionValue({
        a: storedBlock("a", "page-1"),
        b: storedBlock("b", "page-2"),
      })
    );

    expect(storage.getItem("site-local-blocks:page-1")).toContain('"a"');
    expect(storage.getItem("site-local-blocks:page-2")).toContain('"b"');

    const merged = JSON.parse(sharded.getItem("site-local-blocks") ?? "{}");
    expect(Object.keys(merged).sort()).toEqual(["a", "b"]);
  });

  it("removes a page shard when its blocks disappear from the collection", () => {
    const storage = createMemoryStorage();
    const sharded = createPageShardedBlockStorage(storage);

    sharded.setItem(
      "site-local-blocks",
      collectionValue({
        a: storedBlock("a", "page-1"),
        b: storedBlock("b", "page-2"),
      })
    );
    sharded.setItem(
      "site-local-blocks",
      collectionValue({ a: storedBlock("a", "page-1") })
    );

    expect(storage.getItem("site-local-blocks:page-2")).toBeNull();
  });

  it("quarantines unparseable blocks instead of destroying them on overwrite", () => {
    const storage = createMemoryStorage();
    const sharded = createPageShardedBlockStorage(storage);

    // Seed a shard containing one valid block and one that no longer parses
    // (e.g. after a schema tightening) — written directly, as if by an older
    // app version.
    storage.setItem(
      "site-local-blocks:page-1",
      JSON.stringify({
        good: storedBlock("good", "page-1"),
        broken: {
          versionKey: "v-broken",
          data: { id: "broken", pageId: "page-1", type: "no-such-type" },
        },
      })
    );

    // The collection layer dropped `broken` at read time; its next write
    // includes only the valid block.
    sharded.setItem(
      "site-local-blocks",
      collectionValue({ good: storedBlock("good", "page-1", "edited") })
    );

    const quarantine = JSON.parse(
      storage.getItem(BLOCK_QUARANTINE_KEY) ?? "{}"
    );
    expect(Object.keys(quarantine)).toEqual(["broken"]);
    expect(quarantine.broken.data.type).toBe("no-such-type");
  });

  it("does not quarantine deliberately deleted blocks (they still parse)", () => {
    const storage = createMemoryStorage();
    const sharded = createPageShardedBlockStorage(storage);

    sharded.setItem(
      "site-local-blocks",
      collectionValue({
        a: storedBlock("a", "page-1"),
        b: storedBlock("b", "page-1"),
      })
    );
    sharded.setItem(
      "site-local-blocks",
      collectionValue({ a: storedBlock("a", "page-1") })
    );

    expect(storage.getItem(BLOCK_QUARANTINE_KEY)).toBeNull();
  });
});
