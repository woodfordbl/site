import { describe, expect, it } from "vitest";
import { resolveBand } from "@/lib/dnd/band.ts";

function rect(top: number, height: number): DOMRect {
  return {
    top,
    bottom: top + height,
    left: 0,
    right: 100,
    width: 100,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("resolveBand", () => {
  it("returns before within the top edge band", () => {
    expect(resolveBand(102, rect(100, 40))).toBe("before");
  });

  it("returns after within the bottom edge band", () => {
    expect(resolveBand(138, rect(100, 40))).toBe("after");
  });

  it("returns middle between the edge bands", () => {
    expect(resolveBand(120, rect(100, 40))).toBe("middle");
  });

  it("caps the edge band by ratio on short rows", () => {
    // height 10, edgeRatio 0.35 -> edge 3.5px (smaller than the 10px cap)
    expect(resolveBand(104, rect(100, 10))).toBe("middle");
    expect(resolveBand(102, rect(100, 10))).toBe("before");
  });

  it("honors a custom edgePx and ratio", () => {
    // height 40, edge = min(18, 40) = 18; relY 30 -> after (default edge 10 -> middle)
    expect(resolveBand(130, rect(100, 40))).toBe("middle");
    expect(resolveBand(130, rect(100, 40), { edgePx: 18, edgeRatio: 1 })).toBe(
      "after"
    );
  });
});
