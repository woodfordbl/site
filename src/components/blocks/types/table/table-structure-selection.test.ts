import { describe, expect, it } from "vitest";

import {
  getTableCellStructureSelectionClassName,
  getTableColumnHandleRevealClasses,
} from "@/components/blocks/types/table/table-structure-selection.ts";

describe("getTableColumnHandleRevealClasses", () => {
  it("targets each column handle when its column is hovered", () => {
    expect(getTableColumnHandleRevealClasses(2)).toBe(
      '[&:has([data-table-column-index="0"]:hover)_[data-table-column-handle="0"]]:opacity-100 [&:has([data-table-column-index="1"]:hover)_[data-table-column-handle="1"]]:opacity-100'
    );
  });

  it("includes reveal rules for every column up to the table width", () => {
    expect(getTableColumnHandleRevealClasses(5)).toContain(
      '[&:has([data-table-column-index="4"]:hover)_[data-table-column-handle="4"]]:opacity-100'
    );
    expect(getTableColumnHandleRevealClasses(5)).not.toContain(
      '[&:has([data-table-column-index="5"]:hover)_[data-table-column-handle="5"]]:opacity-100'
    );
  });
});

describe("getTableCellStructureSelectionClassName", () => {
  const base = {
    columnCount: 3,
    rowCount: 2,
    tableId: "table-1",
    tableRowId: "row-1",
    selection: {
      tableId: "table-1",
      tableRowId: "row-1",
      type: "row" as const,
    },
  };

  it("draws a perimeter on the selected row", () => {
    const corner = getTableCellStructureSelectionClassName({
      ...base,
      columnIndex: 0,
      rowIndex: 0,
    });
    const middle = getTableCellStructureSelectionClassName({
      ...base,
      columnIndex: 1,
      rowIndex: 0,
    });
    const trailing = getTableCellStructureSelectionClassName({
      ...base,
      columnIndex: 2,
      rowIndex: 0,
    });

    expect(corner).toBe(
      "border-t-2 border-t-primary border-b-2 border-b-primary border-l-2 border-l-primary"
    );
    expect(middle).toBe(
      "border-t-2 border-t-primary border-b-2 border-b-primary"
    );
    expect(trailing).toBe(
      "border-t-2 border-t-primary border-b-2 border-b-primary border-r-2 border-r-primary"
    );
  });

  it("draws a perimeter on the selected column", () => {
    const style = getTableCellStructureSelectionClassName({
      columnCount: 3,
      columnIndex: 1,
      rowCount: 2,
      rowIndex: 1,
      selection: {
        columnIndex: 1,
        tableId: "table-1",
        type: "column",
      },
      tableId: "table-1",
      tableRowId: "row-2",
    });

    expect(style).toBe(
      "border-l-2 border-l-primary border-r-2 border-r-primary border-b-2 border-b-primary"
    );
  });
});
