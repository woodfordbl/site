import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  capturePageBaseline,
  clearPageBaseline,
  listBaselinePageIds,
  readPageBaseline,
  writePageBaseline,
} from "@/db/snapshots/page-baseline-store.ts";
import type { Block } from "@/lib/schemas/block.ts";

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

function textBlock(id: string, text: string): Block {
  return { id, type: "text", props: { text } } as Block;
}

beforeEach(() => {
  store.clear();
  // The store guards on `typeof indexedDB` — the idb-keyval mock does the work.
  vi.stubGlobal("indexedDB", {});
});

describe("page-baseline-store", () => {
  it("round-trips a baseline under the reserved page key", async () => {
    await writePageBaseline("home", {
      blocks: [textBlock("b1", "shipped")],
      contentHash: "hash-1",
      capturedAt: "2026-07-01T00:00:00.000Z",
    });

    const baseline = await readPageBaseline("home");
    expect(baseline?.contentHash).toBe("hash-1");
    expect(baseline?.blocks).toHaveLength(1);
    expect(store.has("home:baseline")).toBe(true);
  });

  it("returns undefined for a page with no baseline", async () => {
    await expect(readPageBaseline("missing")).resolves.toBeUndefined();
  });

  it("clears a baseline without touching other pages", async () => {
    await writePageBaseline("home", {
      blocks: [],
      contentHash: "a",
      capturedAt: "2026-07-01T00:00:00.000Z",
    });
    await writePageBaseline("about", {
      blocks: [],
      contentHash: "b",
      capturedAt: "2026-07-01T00:00:00.000Z",
    });

    await clearPageBaseline("home");

    await expect(readPageBaseline("home")).resolves.toBeUndefined();
    await expect(readPageBaseline("about")).resolves.toBeDefined();
  });

  it("lists baseline page ids without matching snapshot keys", async () => {
    store.set("home:index", { pageId: "home", descriptors: [] });
    store.set("home:snap:s1", { id: "s1" });
    await writePageBaseline("home", {
      blocks: [],
      contentHash: "a",
      capturedAt: "2026-07-01T00:00:00.000Z",
    });
    await writePageBaseline("about", {
      blocks: [],
      contentHash: "b",
      capturedAt: "2026-07-01T00:00:00.000Z",
    });

    await expect(listBaselinePageIds()).resolves.toEqual(["home", "about"]);
  });

  it("capturePageBaseline writes fire-and-forget with the given hash", async () => {
    capturePageBaseline("home", [textBlock("b1", "shipped")], "hash-1");

    await vi.waitFor(async () => {
      const baseline = await readPageBaseline("home");
      expect(baseline?.contentHash).toBe("hash-1");
    });
  });
});
