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

    expect(corner).toBe("border-t-accent border-b-accent border-l-accent");
    expect(middle).toBe("border-t-accent border-b-accent");
    expect(trailing).toBe("border-t-accent border-b-accent border-r-accent");
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

    expect(style).toBe("border-l-accent border-r-accent border-b-accent");
  });
});
