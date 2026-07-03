// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
  CALLOUT_CONTAINER_FLAG_KEY,
  migrateCalloutsToContainers,
} from "@/db/collections/migrate-local-storage.ts";
import { blockShardStorageKey } from "@/db/collections/page-sharded-block-storage.ts";

interface ShardEntry {
  data: Record<string, unknown>;
  versionKey: string;
}

function readShard(pageId: string): Record<string, ShardEntry> {
  return JSON.parse(
    localStorage.getItem(blockShardStorageKey(pageId)) ?? "{}"
  ) as Record<string, ShardEntry>;
}

describe("migrateCalloutsToContainers", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("moves legacy callout text into a child text block and keeps the icon", () => {
    localStorage.setItem(
      blockShardStorageKey("page-1"),
      JSON.stringify({
        callout: {
          data: {
            id: "callout",
            type: "callout",
            parentId: null,
            pageId: "page-1",
            props: { text: "Heads up", icon: "tabler:IconInfoCircle" },
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          versionKey: "2026-01-01T00:00:00.000Z",
        },
      })
    );

    migrateCalloutsToContainers();

    const shard = readShard("page-1");
    expect(shard.callout?.data.props).toEqual({
      icon: "tabler:IconInfoCircle",
    });

    const child = Object.values(shard).find(
      (entry) => entry.data.parentId === "callout"
    );
    expect(child?.data.type).toBe("text");
    expect((child?.data.props as { text: string }).text).toBe("Heads up");
    expect(localStorage.getItem(CALLOUT_CONTAINER_FLAG_KEY)).toBe("done");
  });

  it("keys the new child with the same prefix as the shard map keys", () => {
    localStorage.setItem(
      blockShardStorageKey("page-1"),
      JSON.stringify({
        "s:callout": {
          data: {
            id: "callout",
            type: "callout",
            pageId: "page-1",
            props: { text: "Prefixed" },
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          versionKey: "2026-01-01T00:00:00.000Z",
        },
      })
    );

    migrateCalloutsToContainers();

    const shard = readShard("page-1");
    const childKey = Object.keys(shard).find((k) => k !== "s:callout");
    expect(childKey?.startsWith("s:")).toBe(true);
    expect(shard[childKey ?? ""]?.data.parentId).toBe("callout");
  });

  it("drops the icon key when the legacy callout had none", () => {
    localStorage.setItem(
      blockShardStorageKey("page-1"),
      JSON.stringify({
        callout: {
          data: {
            id: "callout",
            type: "callout",
            pageId: "page-1",
            props: { text: "No glyph" },
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          versionKey: "2026-01-01T00:00:00.000Z",
        },
      })
    );

    migrateCalloutsToContainers();

    const shard = readShard("page-1");
    expect(shard.callout?.data.props).toEqual({});
  });

  it("runs only once", () => {
    localStorage.setItem(CALLOUT_CONTAINER_FLAG_KEY, "done");
    localStorage.setItem(
      blockShardStorageKey("page-1"),
      JSON.stringify({
        callout: {
          data: {
            id: "callout",
            type: "callout",
            pageId: "page-1",
            props: { text: "Untouched" },
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          versionKey: "2026-01-01T00:00:00.000Z",
        },
      })
    );

    migrateCalloutsToContainers();

    const shard = readShard("page-1");
    expect((shard.callout?.data.props as { text?: string }).text).toBe(
      "Untouched"
    );
    expect(Object.keys(shard)).toHaveLength(1);
  });
});
