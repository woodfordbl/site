import { describe, expect, it } from "vitest";

import {
  aggregateFnLabel,
  CHECKBOX_MIN_COLUMN_WIDTH_PX,
  type ColumnDropZoneRect,
  clampColumnWidthPx,
  configWithColumnWidth,
  configWithoutColumnWidth,
  DEFAULT_COLUMN_WIDTH_PX,
  isInlineEditableField,
  isoDateToLocalDate,
  isSyncedField,
  MIN_COLUMN_WIDTH_PX,
  minColumnWidthPx,
  nextEditTarget,
  parseNumberCellInput,
  planColumnReorder,
  resolveColumnDropSpot,
  resolveColumnWidthPx,
  urlCellHref,
  withPinnedRowIndex,
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

describe("clampColumnWidthPx", () => {
  it("rounds to whole pixels", () => {
    expect(clampColumnWidthPx(240.6)).toBe(241);
  });

  it("clamps below the minimum", () => {
    expect(clampColumnWidthPx(10)).toBe(MIN_COLUMN_WIDTH_PX);
    expect(clampColumnWidthPx(-50)).toBe(MIN_COLUMN_WIDTH_PX);
  });

  it("clamps below a supplied minimum", () => {
    expect(clampColumnWidthPx(10, CHECKBOX_MIN_COLUMN_WIDTH_PX)).toBe(
      CHECKBOX_MIN_COLUMN_WIDTH_PX
    );
  });
});

describe("minColumnWidthPx", () => {
  it("lets checkbox columns collapse below the text-column floor", () => {
    expect(minColumnWidthPx({ type: "checkbox" })).toBe(
      CHECKBOX_MIN_COLUMN_WIDTH_PX
    );
    expect(CHECKBOX_MIN_COLUMN_WIDTH_PX).toBeLessThan(MIN_COLUMN_WIDTH_PX);
  });

  it("keeps the general floor for text columns", () => {
    expect(minColumnWidthPx({ type: "text" })).toBe(MIN_COLUMN_WIDTH_PX);
  });
});

describe("configWithColumnWidth", () => {
  it("sets a clamped width and keeps other keys", () => {
    expect(
      configWithColumnWidth(
        { columnWidths: { f1: 240 }, pinnedFieldIds: ["f1"] },
        "f2",
        10
      )
    ).toEqual({
      columnWidths: { f1: 240, f2: MIN_COLUMN_WIDTH_PX },
      pinnedFieldIds: ["f1"],
    });
  });

  it("overwrites an existing width", () => {
    expect(
      configWithColumnWidth({ columnWidths: { f1: 240 } }, "f1", 300)
    ).toEqual({ columnWidths: { f1: 300 } });
  });
});

describe("configWithoutColumnWidth", () => {
  it("removes the stored width", () => {
    expect(
      configWithoutColumnWidth({ columnWidths: { f1: 240, f2: 300 } }, "f1")
    ).toEqual({ columnWidths: { f2: 300 } });
  });

  it("drops the record entirely when it empties", () => {
    expect(
      configWithoutColumnWidth({ columnWidths: { f1: 240 } }, "f1")
    ).toEqual({ columnWidths: undefined });
  });

  it("returns null when nothing is stored", () => {
    expect(configWithoutColumnWidth({}, "f1")).toBeNull();
    expect(configWithoutColumnWidth({ columnWidths: { f2: 1 } }, "f1")).toBe(
      null
    );
  });
});

describe("planColumnReorder", () => {
  const ids = ["a", "b", "c", "d"];

  it("moves a column before another", () => {
    expect(
      planColumnReorder({
        displayFieldIds: ids,
        pinnedCount: 0,
        sourceFieldId: "d",
        targetFieldId: "b",
        edge: "before",
      })
    ).toEqual({ columnOrder: ["a", "d", "b", "c"], pinnedFieldIds: [] });
  });

  it("moves a column after another", () => {
    expect(
      planColumnReorder({
        displayFieldIds: ids,
        pinnedCount: 0,
        sourceFieldId: "a",
        targetFieldId: "c",
        edge: "after",
      })
    ).toEqual({ columnOrder: ["b", "c", "a", "d"], pinnedFieldIds: [] });
  });

  it("returns null for no-op drops", () => {
    expect(
      planColumnReorder({
        displayFieldIds: ids,
        pinnedCount: 0,
        sourceFieldId: "a",
        targetFieldId: "b",
        edge: "before",
      })
    ).toBeNull();
    expect(
      planColumnReorder({
        displayFieldIds: ids,
        pinnedCount: 0,
        sourceFieldId: "b",
        targetFieldId: "a",
        edge: "after",
      })
    ).toBeNull();
  });

  it("returns null for self-drops and unknown ids", () => {
    expect(
      planColumnReorder({
        displayFieldIds: ids,
        pinnedCount: 0,
        sourceFieldId: "a",
        targetFieldId: "a",
        edge: "before",
      })
    ).toBeNull();
    expect(
      planColumnReorder({
        displayFieldIds: ids,
        pinnedCount: 0,
        sourceFieldId: "ghost",
        targetFieldId: "a",
        edge: "before",
      })
    ).toBeNull();
    expect(
      planColumnReorder({
        displayFieldIds: ids,
        pinnedCount: 0,
        sourceFieldId: "a",
        targetFieldId: "ghost",
        edge: "before",
      })
    ).toBeNull();
  });

  it("pins a column dropped left of the freeze boundary", () => {
    // Pinned prefix [a, b]; dropping c before b lands inside the prefix.
    expect(
      planColumnReorder({
        displayFieldIds: ids,
        pinnedCount: 2,
        sourceFieldId: "c",
        targetFieldId: "b",
        edge: "before",
      })
    ).toEqual({
      columnOrder: ["a", "c", "b", "d"],
      pinnedFieldIds: ["a", "c", "b"],
    });
  });

  it("unpins a column dropped right of the freeze boundary", () => {
    expect(
      planColumnReorder({
        displayFieldIds: ids,
        pinnedCount: 2,
        sourceFieldId: "b",
        targetFieldId: "c",
        edge: "after",
      })
    ).toEqual({ columnOrder: ["a", "c", "b", "d"], pinnedFieldIds: ["a"] });
    // Dragging the first pinned column to the end unpins it too.
    expect(
      planColumnReorder({
        displayFieldIds: ids,
        pinnedCount: 2,
        sourceFieldId: "a",
        targetFieldId: "d",
        edge: "after",
      })
    ).toEqual({
      columnOrder: ["b", "c", "d", "a"],
      pinnedFieldIds: ["b"],
    });
  });

  it("keeps the pin state on a drop exactly at the boundary", () => {
    // Unpinned d dropped right after the last pinned column moves but stays
    // unpinned.
    expect(
      planColumnReorder({
        displayFieldIds: ids,
        pinnedCount: 2,
        sourceFieldId: "d",
        targetFieldId: "b",
        edge: "after",
      })
    ).toEqual({
      columnOrder: ["a", "b", "d", "c"],
      pinnedFieldIds: ["a", "b"],
    });
    // Pinned b picked up and dropped back at the boundary is a no-op — it
    // never silently unpins.
    expect(
      planColumnReorder({
        displayFieldIds: ids,
        pinnedCount: 2,
        sourceFieldId: "b",
        targetFieldId: "c",
        edge: "before",
      })
    ).toBeNull();
  });
});

describe("resolveColumnDropSpot", () => {
  const rect = (
    fieldId: string,
    left: number,
    right: number,
    pinned = false
  ): ColumnDropZoneRect => ({ fieldId, left, right, pinned });

  it("resolves the containing column with a midpoint edge", () => {
    const rects = [rect("a", 0, 100), rect("b", 100, 300)];
    expect(resolveColumnDropSpot(rects, 30)).toEqual({
      fieldId: "a",
      edge: "before",
    });
    expect(resolveColumnDropSpot(rects, 80)).toEqual({
      fieldId: "a",
      edge: "after",
    });
    expect(resolveColumnDropSpot(rects, 250)).toEqual({
      fieldId: "b",
      edge: "after",
    });
  });

  it("prefers pinned rects when overlapping scrolled-under columns", () => {
    const rects = [
      rect("pinned", 0, 100, true),
      // Scrolled partially underneath the sticky pinned column.
      rect("under", -40, 160),
    ];
    expect(resolveColumnDropSpot(rects, 50)).toEqual({
      fieldId: "pinned",
      edge: "after",
    });
  });

  it("snaps to the nearest end outside every rect", () => {
    const rects = [rect("a", 100, 200), rect("b", 200, 300)];
    expect(resolveColumnDropSpot(rects, 50)).toEqual({
      fieldId: "a",
      edge: "before",
    });
    expect(resolveColumnDropSpot(rects, 400)).toEqual({
      fieldId: "b",
      edge: "after",
    });
  });

  it("returns null with no rects", () => {
    expect(resolveColumnDropSpot([], 10)).toBeNull();
  });
});

describe("isInlineEditableField", () => {
  const field = (type: DatabaseField["type"]): DatabaseField => {
    if (type === "select" || type === "multiSelect") {
      return { id: "f", name: "F", type, options: [] };
    }
    if (type === "formula") {
      return { id: "f", name: "F", type, expression: "" };
    }
    return { id: "f", name: "F", type };
  };

  it("marks every editor-backed type editable", () => {
    expect(isInlineEditableField(field("text"))).toBe(true);
    expect(isInlineEditableField(field("url"))).toBe(true);
    expect(isInlineEditableField(field("number"))).toBe(true);
    expect(isInlineEditableField(field("select"))).toBe(true);
    expect(isInlineEditableField(field("multiSelect"))).toBe(true);
    expect(isInlineEditableField(field("date"))).toBe(true);
  });

  it("excludes checkbox — it toggles in place", () => {
    expect(isInlineEditableField(field("checkbox"))).toBe(false);
  });

  it("excludes formula — computed cells are read-only", () => {
    expect(isInlineEditableField(field("formula"))).toBe(false);
  });

  it("excludes synced fields — the sync engine owns their values", () => {
    expect(isInlineEditableField({ ...field("text"), sourceKey: "name" })).toBe(
      false
    );
    expect(isSyncedField({ sourceKey: "name" })).toBe(true);
    expect(isSyncedField({})).toBe(false);
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

describe("isoDateToLocalDate", () => {
  it("parses a yyyy-mm-dd part into a local date", () => {
    const date = isoDateToLocalDate("2026-03-05");
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(2);
    expect(date?.getDate()).toBe(5);
  });

  it("rejects non-date input", () => {
    expect(isoDateToLocalDate("")).toBeNull();
    expect(isoDateToLocalDate("2026-03-05T10:00:00Z")).toBeNull();
    expect(isoDateToLocalDate("not a date")).toBeNull();
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

describe("withPinnedRowIndex", () => {
  it("returns the range unchanged (same identity) when nothing is pinned", () => {
    const indexes = [3, 4, 5];
    expect(withPinnedRowIndex(indexes, -1)).toBe(indexes);
  });

  it("returns the range unchanged when the pinned index is already in it", () => {
    const indexes = [3, 4, 5];
    expect(withPinnedRowIndex(indexes, 4)).toBe(indexes);
  });

  it("merges a pinned index above the window in ascending order", () => {
    expect(withPinnedRowIndex([3, 4, 5], 0)).toEqual([0, 3, 4, 5]);
  });

  it("merges a pinned index below the window in ascending order", () => {
    expect(withPinnedRowIndex([3, 4, 5], 42)).toEqual([3, 4, 5, 42]);
  });

  it("never duplicates window edges", () => {
    expect(withPinnedRowIndex([0, 1, 2], 0)).toEqual([0, 1, 2]);
    expect(withPinnedRowIndex([0, 1, 2], 2)).toEqual([0, 1, 2]);
  });
});
