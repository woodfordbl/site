import { describe, expect, it } from "vitest";

import {
  clampMediaWidthPercent,
  resolveMediaWidthPercent,
  widthPercentFromCenteredDelta,
  widthPercentFromDelta,
} from "@/lib/media/media-resize.ts";

describe("clampMediaWidthPercent", () => {
  it("clamps below minimum", () => {
    expect(clampMediaWidthPercent(10)).toBe(25);
  });

  it("clamps above maximum", () => {
    expect(clampMediaWidthPercent(120)).toBe(100);
  });

  it("rounds to integer", () => {
    expect(clampMediaWidthPercent(50.6)).toBe(51);
  });
});

describe("resolveMediaWidthPercent", () => {
  it("defaults to 100 when omitted", () => {
    expect(resolveMediaWidthPercent(undefined)).toBe(100);
  });

  it("clamps stored values", () => {
    expect(resolveMediaWidthPercent(40)).toBe(40);
    expect(resolveMediaWidthPercent(10)).toBe(25);
  });
});

describe("widthPercentFromDelta", () => {
  it("grows width when dragging the right handle right", () => {
    expect(
      widthPercentFromDelta({
        anchor: "right",
        containerWidthPx: 800,
        deltaPx: 80,
        startWidthPercent: 50,
      })
    ).toBe(60);
  });

  it("shrinks width when dragging the left handle right", () => {
    expect(
      widthPercentFromDelta({
        anchor: "left",
        containerWidthPx: 800,
        deltaPx: 80,
        startWidthPercent: 50,
      })
    ).toBe(40);
  });
});

describe("widthPercentFromCenteredDelta", () => {
  it("doubles pointer delta so a centered block edge tracks the cursor", () => {
    expect(
      widthPercentFromCenteredDelta({
        anchor: "right",
        containerWidthPx: 800,
        deltaPx: 40,
        startWidthPercent: 50,
      })
    ).toBe(60);
  });

  it("shrinks symmetrically when dragging the left handle right", () => {
    expect(
      widthPercentFromCenteredDelta({
        anchor: "left",
        containerWidthPx: 800,
        deltaPx: 40,
        startWidthPercent: 50,
      })
    ).toBe(40);
  });
});
