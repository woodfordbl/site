import { describe, expect, it } from "vitest";

import { resolveDocumentOrderIds } from "@/lib/blocks/order-blocks.ts";

describe("resolveDocumentOrderIds", () => {
  it("keeps a pending local order ahead of a stale persisted order", () => {
    expect(
      resolveDocumentOrderIds({
        pendingOrder: ["a", "b", "new"],
        persistedOrder: ["a", "b"],
        storageOrder: ["a", "b", "new"],
        workingOrder: ["a", "b", "new"],
      })
    ).toEqual(["a", "b", "new"]);
  });

  it("keeps a pending local reorder ahead of complete persisted order", () => {
    expect(
      resolveDocumentOrderIds({
        pendingOrder: ["b", "a"],
        persistedOrder: ["a", "b"],
        storageOrder: ["a", "b"],
        workingOrder: ["b", "a"],
      })
    ).toEqual(["b", "a"]);
  });

  it("uses a complete persisted order when no local order is pending", () => {
    expect(
      resolveDocumentOrderIds({
        persistedOrder: ["c", "a", "b"],
        storageOrder: ["a", "b", "c"],
        workingOrder: ["a", "b", "c"],
      })
    ).toEqual(["c", "a", "b"]);
  });

  it("preserves working order while persisted order is incomplete", () => {
    expect(
      resolveDocumentOrderIds({
        persistedOrder: ["a", "b"],
        storageOrder: ["a", "b", "c"],
        workingOrder: ["a", "c", "b"],
      })
    ).toEqual(["a", "c", "b"]);
  });
});
