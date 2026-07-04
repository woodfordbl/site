import { describe, expect, it } from "vitest";

import {
  type BoardDropZones,
  type BoardGroupField,
  buildBoardColumns,
  resolveBoardCardFields,
  resolveBoardDropTarget,
  resolveBoardGroupField,
} from "@/components/database/views/board-helpers.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseView,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

const statusField: BoardGroupField = {
  id: "f-status",
  name: "Status",
  type: "select",
  options: [
    { id: "opt-todo", name: "Todo", color: "blue" },
    { id: "opt-doing", name: "Doing" },
    { id: "opt-done", name: "Done", color: "green" },
  ],
};

const textField: DatabaseField = { id: "f-name", name: "Name", type: "text" };
const numberField: DatabaseField = {
  id: "f-num",
  name: "Amount",
  type: "number",
};
const dateField: DatabaseField = { id: "f-due", name: "Due", type: "date" };

function makeRow(
  id: string,
  values: Record<string, DatabaseCellValue>
): LocalDatabaseRow {
  return {
    id,
    databaseId: "db-1",
    values,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeView(
  board?: NonNullable<DatabaseView["config"]>["board"]
): DatabaseView {
  return {
    id: "view-1",
    name: "Board",
    type: "board",
    config: board ? { board } : {},
  };
}

describe("resolveBoardGroupField", () => {
  it("uses the configured board group field when it is a live select", () => {
    const view = makeView({ groupFieldId: "f-status" });
    expect(resolveBoardGroupField([textField, statusField], view)).toBe(
      statusField
    );
  });

  it("falls back to the first select field for stale/non-select config", () => {
    const stale = makeView({ groupFieldId: "gone" });
    expect(resolveBoardGroupField([textField, statusField], stale)).toBe(
      statusField
    );
    const nonSelect = makeView({ groupFieldId: "f-name" });
    expect(resolveBoardGroupField([textField, statusField], nonSelect)).toBe(
      statusField
    );
    expect(resolveBoardGroupField([statusField, textField], makeView())).toBe(
      statusField
    );
  });

  it("returns null when the schema has no select field", () => {
    expect(
      resolveBoardGroupField([textField, numberField], makeView())
    ).toBeNull();
  });
});

describe("resolveBoardCardFields", () => {
  const fields = [textField, statusField, numberField, dateField];

  it("defaults to the first two non-primary, non-group fields", () => {
    expect(
      resolveBoardCardFields(fields, makeView(), "f-name", "f-status")
    ).toEqual([numberField, dateField]);
  });

  it("respects configured cardFieldIds, dropping stale ids and the primary", () => {
    const view = makeView({
      cardFieldIds: ["f-due", "f-name", "gone", "f-status"],
    });
    expect(resolveBoardCardFields(fields, view, "f-name", "f-status")).toEqual([
      dateField,
      statusField,
    ]);
  });
});

describe("buildBoardColumns", () => {
  it("builds one column per option in option order plus the empty column last", () => {
    const rows = [
      makeRow("r1", { "f-status": "opt-done" }),
      makeRow("r2", {}),
      makeRow("r3", { "f-status": "opt-todo" }),
      makeRow("r4", { "f-status": "opt-todo" }),
    ];
    const { columns, hidden } = buildBoardColumns({ field: statusField, rows });

    expect(hidden).toEqual([]);
    expect(columns.map((column) => column.key)).toEqual([
      "opt-todo",
      "opt-doing",
      "opt-done",
      "",
    ]);
    expect(columns.map((column) => column.rows.map((row) => row.id))).toEqual([
      ["r3", "r4"],
      [],
      ["r1"],
      ["r2"],
    ]);
    // The empty column is labelled "No <field>" and writes null.
    expect(columns.at(-1)).toMatchObject({ label: "No Status", value: null });
    // Option columns carry the option color and write the option id.
    expect(columns[0]).toMatchObject({
      color: "blue",
      label: "Todo",
      value: "opt-todo",
    });
  });

  it("keeps rows with stale option ids in labelled columns before the empty column", () => {
    const rows = [makeRow("r1", { "f-status": "opt-gone" }), makeRow("r2", {})];
    const { columns } = buildBoardColumns({ field: statusField, rows });
    expect(columns.map((column) => column.key)).toEqual([
      "opt-todo",
      "opt-doing",
      "opt-done",
      "opt-gone",
      "",
    ]);
    expect(columns[3]).toMatchObject({ label: "opt-gone", value: "opt-gone" });
  });

  it("splits hidden columns out (real columns only) and preserves order", () => {
    const rows = [makeRow("r1", { "f-status": "opt-doing" })];
    const { columns, hidden } = buildBoardColumns({
      field: statusField,
      hiddenColumnIds: ["opt-doing", "", "not-a-column"],
      rows,
    });
    expect(columns.map((column) => column.key)).toEqual([
      "opt-todo",
      "opt-done",
    ]);
    expect(hidden.map((column) => column.key)).toEqual(["opt-doing", ""]);
  });

  it("sorts option columns alphabetically, keeping the empty column last", () => {
    const rows = [makeRow("r1", {})];
    const { columns } = buildBoardColumns({
      columnSort: "alphabetical",
      field: statusField,
      rows,
    });
    // Doing, Done, Todo by name; "No Status" always last.
    expect(columns.map((column) => column.label)).toEqual([
      "Doing",
      "Done",
      "Todo",
      "No Status",
    ]);
  });

  it("orders option columns by color (palette order), colorless last", () => {
    // Palette order is green before blue, so Done (green) precedes Todo
    // (blue); the colorless Doing option sorts after both colored ones.
    const { columns } = buildBoardColumns({
      columnSort: "color",
      field: statusField,
      rows: [],
    });
    expect(columns.slice(0, 3).map((column) => column.label)).toEqual([
      "Done",
      "Todo",
      "Doing",
    ]);
  });

  it("drops empty columns entirely when hideEmptyColumns is set", () => {
    const rows = [makeRow("r1", { "f-status": "opt-todo" })];
    const { columns, hidden } = buildBoardColumns({
      field: statusField,
      hideEmptyColumns: true,
      rows,
    });
    // Only the populated Todo column survives; empties are not in `hidden`.
    expect(columns.map((column) => column.key)).toEqual(["opt-todo"]);
    expect(hidden).toEqual([]);
  });

  it("keeps a manually-hidden empty column in the hidden bucket, not dropped", () => {
    const { columns, hidden } = buildBoardColumns({
      field: statusField,
      hiddenColumnIds: ["opt-doing"],
      hideEmptyColumns: true,
      rows: [],
    });
    // Manual hide wins: opt-doing goes to `hidden` (with its unhide chip),
    // the other empties are dropped.
    expect(columns).toEqual([]);
    expect(hidden.map((column) => column.key)).toEqual(["opt-doing"]);
  });
});

describe("resolveBoardDropTarget", () => {
  const zones: BoardDropZones = {
    columns: [
      { key: "opt-todo", left: 0, right: 100 },
      { key: "opt-done", left: 110, right: 210 },
      { key: "", left: 220, right: 320 },
    ],
    cardsByColumn: new Map([
      [
        "opt-todo",
        [
          { id: "a", top: 0, bottom: 40 },
          { id: "b", top: 48, bottom: 88 },
        ],
      ],
      ["opt-done", [{ id: "c", top: 0, bottom: 40 }]],
      ["", []],
    ]),
  };

  it("returns null with no columns", () => {
    expect(
      resolveBoardDropTarget({
        allowReorder: true,
        pointer: { x: 10, y: 10 },
        sourceId: "x",
        zones: { columns: [], cardsByColumn: new Map() },
      })
    ).toBeNull();
  });

  it("resolves a between-cards slot from the pointer's card midpoints", () => {
    // Above card `a`'s midpoint → before `a`.
    expect(
      resolveBoardDropTarget({
        allowReorder: true,
        pointer: { x: 50, y: 10 },
        sourceId: "c",
        zones,
      })
    ).toEqual({
      kind: "between",
      columnKey: "opt-todo",
      beforeCardId: "a",
      afterCardId: null,
    });
    // Between the two cards' midpoints → between `a` and `b`.
    expect(
      resolveBoardDropTarget({
        allowReorder: true,
        pointer: { x: 50, y: 40 },
        sourceId: "c",
        zones,
      })
    ).toEqual({
      kind: "between",
      columnKey: "opt-todo",
      beforeCardId: "b",
      afterCardId: "a",
    });
    // Below the last midpoint → end of the column.
    expect(
      resolveBoardDropTarget({
        allowReorder: true,
        pointer: { x: 50, y: 200 },
        sourceId: "c",
        zones,
      })
    ).toEqual({
      kind: "between",
      columnKey: "opt-todo",
      beforeCardId: null,
      afterCardId: "b",
    });
  });

  it("excludes the dragged card from neighbor resolution", () => {
    expect(
      resolveBoardDropTarget({
        allowReorder: true,
        pointer: { x: 50, y: 60 },
        sourceId: "b",
        zones,
      })
    ).toEqual({
      kind: "between",
      columnKey: "opt-todo",
      beforeCardId: null,
      afterCardId: "a",
    });
    // Its own column becomes a whole-column target once it is the only card.
    expect(
      resolveBoardDropTarget({
        allowReorder: true,
        pointer: { x: 150, y: 20 },
        sourceId: "c",
        zones,
      })
    ).toEqual({ kind: "column", columnKey: "opt-done" });
  });

  it("targets empty columns (and everything, when reorder is disabled) as whole columns", () => {
    expect(
      resolveBoardDropTarget({
        allowReorder: true,
        pointer: { x: 250, y: 20 },
        sourceId: "a",
        zones,
      })
    ).toEqual({ kind: "column", columnKey: "" });
    expect(
      resolveBoardDropTarget({
        allowReorder: false,
        pointer: { x: 50, y: 40 },
        sourceId: "c",
        zones,
      })
    ).toEqual({ kind: "column", columnKey: "opt-todo" });
  });

  it("snaps gap and out-of-range pointers to the nearest column", () => {
    // In the gap between the first two columns, nearer the second.
    expect(
      resolveBoardDropTarget({
        allowReorder: false,
        pointer: { x: 108, y: 20 },
        sourceId: "a",
        zones,
      })
    ).toEqual({ kind: "column", columnKey: "opt-done" });
    // Past the right edge → last column.
    expect(
      resolveBoardDropTarget({
        allowReorder: false,
        pointer: { x: 900, y: 20 },
        sourceId: "a",
        zones,
      })
    ).toEqual({ kind: "column", columnKey: "" });
  });
});
