import { describe, expect, it } from "vitest";

import { computeObjectContainContentBounds } from "@/lib/dom/object-contain-bounds.ts";

describe("computeObjectContainContentBounds", () => {
  it("centers a wide image with vertical letterboxing", () => {
    const bounds = computeObjectContainContentBounds(800, 480, {
      width: 800,
      height: 450,
    });

    expect(bounds.width).toBe(800);
    expect(bounds.height).toBe(450);
    expect(bounds.left).toBe(0);
    expect(bounds.top).toBe(15);
  });

  it("centers a tall image with horizontal pillarboxing", () => {
    const bounds = computeObjectContainContentBounds(400, 480, {
      width: 300,
      height: 600,
    });

    expect(bounds.height).toBe(480);
    expect(bounds.width).toBe(240);
    expect(bounds.left).toBe(80);
    expect(bounds.top).toBe(0);
  });
});
