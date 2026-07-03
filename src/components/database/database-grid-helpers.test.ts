import { describe, expect, it } from "vitest";

import {
  aggregateFnLabel,
  DEFAULT_COLUMN_WIDTH_PX,
  isInlineEditableField,
  MIN_COLUMN_WIDTH_PX,
  nextEditTarget,
  parseNumberCellInput,
  resolveColumnWidthPx,
  urlCellHref,
} from "@/components/database/database-grid-helpers.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";

describe("resolveColumnWidthPx", () => {
  it("falls back to the default width when unset", () => {
    expect(resolveColumnWidthPx({}, "f1")).toBe(DEFAULT_COLUMN_WIDTH_PX);
  });

  it("reads the stored width", () => {
    expect(resolveColumnWidthPx({ columnWidths: { f1: 240 } }, "f1")).toBe(240);
  });

  it("clamps below the minimum", () => {
    expect(resolveColumnWidthPx({ columnWidths: { f1: 20 } }, "f1")).toBe(
      MIN_COLUMN_WIDTH_PX
    );
  });
});

describe("isInlineEditableField", () => {
  const field = (type: DatabaseField["type"]): DatabaseField =>
    type === "select" || type === "multiSelect"
      ? { id: "f", name: "F", type, options: [] }
      : { id: "f", name: "F", type };

  it("marks text, url, and number editable", () => {
    expect(isInlineEditableField(field("text"))).toBe(true);
    expect(isInlineEditableField(field("url"))).toBe(true);
    expect(isInlineEditableField(field("number"))).toBe(true);
  });

  it("excludes checkbox, select, multi-select, and date", () => {
    expect(isInlineEditableField(field("checkbox"))).toBe(false);
    expect(isInlineEditableField(field("select"))).toBe(false);
    expect(isInlineEditableField(field("multiSelect"))).toBe(false);
    expect(isInlineEditableField(field("date"))).toBe(false);
  });
});

describe("nextEditTarget", () => {
  const rowIds = ["r1", "r2"];
  const fieldIds = ["a", "b"];

  it("moves to the next editable cell in the row", () => {
    expect(
      nextEditTarget(rowIds, fieldIds, { rowId: "r1", fieldId: "a" }, "next")
    ).toEqual({ rowId: "r1", fieldId: "b" });
  });

  it("wraps forward onto the next row", () => {
    expect(
      nextEditTarget(rowIds, fieldIds, { rowId: "r1", fieldId: "b" }, "next")
    ).toEqual({ rowId: "r2", fieldId: "a" });
  });

  it("wraps backward onto the previous row", () => {
    expect(
      nextEditTarget(
        rowIds,
        fieldIds,
        { rowId: "r2", fieldId: "a" },
        "previous"
      )
    ).toEqual({ rowId: "r1", fieldId: "b" });
  });

  it("moves down within the same field", () => {
    expect(
      nextEditTarget(rowIds, fieldIds, { rowId: "r1", fieldId: "b" }, "down")
    ).toEqual({ rowId: "r2", fieldId: "b" });
  });

  it("returns null when the move runs off the grid", () => {
    expect(
      nextEditTarget(rowIds, fieldIds, { rowId: "r2", fieldId: "b" }, "next")
    ).toBeNull();
    expect(
      nextEditTarget(
        rowIds,
        fieldIds,
        { rowId: "r1", fieldId: "a" },
        "previous"
      )
    ).toBeNull();
    expect(
      nextEditTarget(rowIds, fieldIds, { rowId: "r2", fieldId: "a" }, "down")
    ).toBeNull();
  });

  it("returns null for stale targets", () => {
    expect(
      nextEditTarget(rowIds, fieldIds, { rowId: "gone", fieldId: "a" }, "next")
    ).toBeNull();
    expect(
      nextEditTarget(rowIds, fieldIds, { rowId: "r1", fieldId: "gone" }, "down")
    ).toBeNull();
  });
});

describe("parseNumberCellInput", () => {
  it("parses numbers", () => {
    expect(parseNumberCellInput("42")).toBe(42);
    expect(parseNumberCellInput(" -3.5 ")).toBe(-3.5);
  });

  it("collapses blank and unparseable input to null", () => {
    expect(parseNumberCellInput("")).toBeNull();
    expect(parseNumberCellInput("   ")).toBeNull();
    expect(parseNumberCellInput("abc")).toBeNull();
    expect(parseNumberCellInput("Infinity")).toBeNull();
  });
});

describe("urlCellHref", () => {
  it("keeps absolute urls", () => {
    expect(urlCellHref("https://example.com")).toBe("https://example.com");
    expect(urlCellHref("mailto:a@b.co")).toBe("mailto:a@b.co");
  });

  it("prefixes bare domains with https", () => {
    expect(urlCellHref("example.com")).toBe("https://example.com");
  });
});

describe("aggregateFnLabel", () => {
  it("uses sentence case", () => {
    expect(aggregateFnLabel("countNotEmpty")).toBe("Count not empty");
    expect(aggregateFnLabel("sum")).toBe("Sum");
  });
});
