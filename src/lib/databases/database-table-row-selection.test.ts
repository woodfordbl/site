import { describe, expect, it, vi } from "vitest";

import {
  registerDatabaseTableRowSelection,
  tryDeleteSelectedDatabaseTableRows,
} from "@/lib/databases/database-table-row-selection.ts";

describe("tryDeleteSelectedDatabaseTableRows", () => {
  it("deletes from the table whose canvas row is in the selection", () => {
    const deleteSelectedRows = vi.fn(() => true);
    const dispose = registerDatabaseTableRowSelection({
      canvasRowId: "block-db",
      deleteSelectedRows,
      getSelectedRowIds: () => ["row-1"],
    });

    expect(tryDeleteSelectedDatabaseTableRows(["block-db"])).toBe(true);
    expect(deleteSelectedRows).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("does not delete when a different canvas block is selected", () => {
    const deleteSelectedRows = vi.fn(() => true);
    const dispose = registerDatabaseTableRowSelection({
      canvasRowId: "block-db",
      deleteSelectedRows,
      getSelectedRowIds: () => ["row-1"],
    });

    expect(tryDeleteSelectedDatabaseTableRows(["block-text"])).toBe(false);
    expect(deleteSelectedRows).not.toHaveBeenCalled();
    dispose();
  });

  it("does not delete when the table has no selected rows", () => {
    const deleteSelectedRows = vi.fn(() => true);
    const dispose = registerDatabaseTableRowSelection({
      canvasRowId: "block-db",
      deleteSelectedRows,
      getSelectedRowIds: () => [],
    });

    expect(tryDeleteSelectedDatabaseTableRows(["block-db"])).toBe(false);
    expect(deleteSelectedRows).not.toHaveBeenCalled();
    dispose();
  });

  it("matches nested canvas row ids (columns containing a database)", () => {
    const deleteSelectedRows = vi.fn(() => true);
    const dispose = registerDatabaseTableRowSelection({
      canvasRowId: "block-db",
      deleteSelectedRows,
      getSelectedRowIds: () => ["row-1"],
    });

    expect(
      tryDeleteSelectedDatabaseTableRows(["cols", "col-1", "block-db"])
    ).toBe(true);
    expect(deleteSelectedRows).toHaveBeenCalledTimes(1);
    dispose();
  });
});
