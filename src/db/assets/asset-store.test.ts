import { describe, expect, it, vi } from "vitest";

const store = new Map<string, Blob>();

vi.mock("idb-keyval", () => {
  const createStore = () => "mock-store";
  return {
    createStore,
    get: (key: string) => Promise.resolve(store.get(key)),
    set: (key: string, value: Blob) => {
      store.set(key, value);
      return Promise.resolve();
    },
    del: (key: string) => {
      store.delete(key);
      return Promise.resolve();
    },
    keys: () => Promise.resolve([...store.keys()]),
  };
});

describe("asset-store", () => {
  it("deduplicates identical blobs by content hash", async () => {
    vi.stubGlobal("indexedDB", {});
    store.clear();
    const { putAsset } = await import("@/db/assets/asset-store.ts");
    const blob = new Blob(["same-bytes"], { type: "image/png" });
    const first = await putAsset(blob);
    const second = await putAsset(
      new Blob(["same-bytes"], { type: "image/png" })
    );
    expect(first.assetId).toBe(second.assetId);
    expect(store.size).toBe(1);
  });
});
