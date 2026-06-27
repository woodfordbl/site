import { describe, expect, it } from "vitest";

import { collectReferencedAssetIds } from "@/db/assets/asset-gc.ts";

/** Minimal in-memory Storage for the synchronous parts of the sweep. */
function makeStorage(entries: Record<string, string>): Storage {
  const map = new Map(Object.entries(entries));
  const keys = () => [...map.keys()];
  return {
    get length() {
      return map.size;
    },
    key: (index: number) => keys()[index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
  } as Storage;
}

function localPages(headerImage: unknown): string {
  return JSON.stringify({
    home: { data: { id: "home", headerImage }, versionKey: "v" },
  });
}

describe("collectReferencedAssetIds — cover images", () => {
  it("treats an uploaded cover asset as referenced", () => {
    const storage = makeStorage({
      "site-local-pages": localPages({ source: "asset", src: "cover-hash" }),
    });

    expect(collectReferencedAssetIds(storage).has("cover-hash")).toBe(true);
  });

  it("ignores url-sourced covers (no asset to protect)", () => {
    const storage = makeStorage({
      "site-local-pages": localPages({
        source: "url",
        src: "https://example.com/c.jpg",
      }),
    });

    expect(collectReferencedAssetIds(storage).size).toBe(0);
  });

  it("tolerates a missing or malformed local-pages blob", () => {
    expect(collectReferencedAssetIds(makeStorage({})).size).toBe(0);
    expect(
      collectReferencedAssetIds(
        makeStorage({ "site-local-pages": "{not json" })
      ).size
    ).toBe(0);
  });
});
