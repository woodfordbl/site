import { describe, expect, it } from "vitest";

import { resolveReorderTarget } from "@/components/database/use-list-reorder.ts";

/** Applies a resolved move to an array the way the Properties list commits it. */
function applyMove<T>(items: T[], from: number, overSlot: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(resolveReorderTarget(from, overSlot), 0, moved);
  return next;
}

describe("resolveReorderTarget", () => {
  it("shifts destinations past the removed row down by one", () => {
    // Dragging index 0 to the trailing slot (4) lands it at the last index.
    expect(resolveReorderTarget(0, 4)).toBe(3);
    expect(resolveReorderTarget(1, 3)).toBe(2);
  });

  it("keeps slots before the removed row unchanged", () => {
    expect(resolveReorderTarget(3, 0)).toBe(0);
    expect(resolveReorderTarget(2, 1)).toBe(1);
  });

  it("resolves an item's own boundaries to a no-op move", () => {
    expect(resolveReorderTarget(1, 1)).toBe(1);
    expect(resolveReorderTarget(1, 2)).toBe(1);
  });
});

describe("applyMove", () => {
  const list = ["a", "b", "c", "d"];

  it("moves the first item to the end", () => {
    expect(applyMove(list, 0, 4)).toEqual(["b", "c", "d", "a"]);
  });

  it("moves the last item to the front", () => {
    expect(applyMove(list, 3, 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("moves a middle item down one slot", () => {
    expect(applyMove(list, 1, 3)).toEqual(["a", "c", "b", "d"]);
  });

  it("leaves order unchanged for an own-boundary drop", () => {
    expect(applyMove(list, 1, 2)).toEqual(list);
  });
});
