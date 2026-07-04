import { describe, expect, it } from "vitest";

import { exprError } from "@/lib/expr/evaluate.ts";
import {
  exprValueToCellValue,
  exprValueToDisplay,
} from "@/lib/expr/format-result.ts";

describe("exprValueToDisplay", () => {
  it("formats numbers via Intl with grouping and trimmed decimals", () => {
    expect(exprValueToDisplay(3)).toBe("3");
    expect(exprValueToDisplay(1234.5)).toBe("1,234.5");
    expect(exprValueToDisplay(1_000_000)).toBe("1,000,000");
    expect(exprValueToDisplay(-0.25)).toBe("-0.25");
  });

  it("formats booleans as Yes/No", () => {
    expect(exprValueToDisplay(true)).toBe("Yes");
    expect(exprValueToDisplay(false)).toBe("No");
  });

  it("formats null as the empty string", () => {
    expect(exprValueToDisplay(null)).toBe("");
  });

  it("passes strings through unchanged", () => {
    expect(exprValueToDisplay("hello")).toBe("hello");
    expect(exprValueToDisplay("")).toBe("");
  });

  it("prefixes errors with a warning glyph", () => {
    expect(exprValueToDisplay(exprError("Division by zero"))).toBe(
      "⚠ Division by zero"
    );
  });
});

describe("exprValueToCellValue", () => {
  it("passes plain values through for filter/sort interop", () => {
    expect(exprValueToCellValue(42)).toBe(42);
    expect(exprValueToCellValue("x")).toBe("x");
    expect(exprValueToCellValue(true)).toBe(true);
    expect(exprValueToCellValue(false)).toBe(false);
    expect(exprValueToCellValue(null)).toBeNull();
  });

  it("collapses errors to null", () => {
    expect(exprValueToCellValue(exprError("nope"))).toBeNull();
  });

  it("collapses non-finite numbers to null", () => {
    expect(exprValueToCellValue(Number.NaN)).toBeNull();
    expect(exprValueToCellValue(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
