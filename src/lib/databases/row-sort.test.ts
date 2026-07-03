import { describe, expect, it } from "vitest";

import {
  applySorts,
  compareCellValues,
  compareManualOrder,
  sortRowsForView,
} from "@/lib/databases/row-sort.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseView,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

const nameField: DatabaseField = { id: "f-name", name: "Name", type: "text" };

const amountField: DatabaseField = {
  id: "f-amount",
  name: "Amount",
  type: "number",
};

const statusField: DatabaseField = {
  id: "f-status",
  name: "Status",
  type: "select",
  options: [
    { id: "opt-todo", name: "Todo" },
    { id: "opt-done", name: "Done" },
  ],
};

const dueField: DatabaseField = { id: "f-due", name: "Due", type: "date" };

const fields = [nameField, amountField, statusField, dueField];

function makeRow(
  id: string,
  values: Record<string, DatabaseCellValue>,
  extra: Partial<Pick<LocalDatabaseRow, "order" | "createdAt">> = {}
): LocalDatabaseRow {
  return {
    id,
    databaseId: "db-1",
    values,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

function makeView(overrides: Partial<DatabaseView> = {}): DatabaseView {
  return { id: "v1", name: "Table", type: "table", config: {}, ...overrides };
}

describe("compareCellValues", () => {
  it("sorts empties last", () => {
    expect(compareCellValues(amountField, 5, null)).toBe(-1);
    expect(compareCellValues(amountField, null, 5)).toBe(1);
    expect(compareCellValues(amountField, null, undefined)).toBe(0);
  });

  it("compares text case-insensitively", () => {
    expect(compareCellValues(nameField, "apple", "Banana")).toBeLessThan(0);
    expect(compareCellValues(nameField, "Apple", "apple")).toBe(0);
  });

  it("compares numbers numerically and dates lexically by date part", () => {
    expect(compareCellValues(amountField, 2, 10)).toBeLessThan(0);
    expect(
      compareCellValues(dueField, "2026-01-02", "2026-01-10T00:00:00.000Z")
    ).toBeLessThan(0);
    expect(
      compareCellValues(dueField, "2026-01-10T08:00:00.000Z", "2026-01-10")
    ).toBe(0);
  });

  it("compares select values by option order", () => {
    expect(compareCellValues(statusField, "opt-todo", "opt-done")).toBeLessThan(
      0
    );
  });

  it("treats wrong-shaped values as empty", () => {
    expect(compareCellValues(amountField, "10", 5)).toBe(1);
  });
});

describe("applySorts", () => {
  const rows = [
    makeRow("r1", { [amountField.id]: 30, [nameField.id]: "b" }),
    makeRow("r2", { [nameField.id]: "a" }),
    makeRow("r3", { [amountField.id]: 10, [nameField.id]: "a" }),
    makeRow("r4", { [amountField.id]: 20, [nameField.id]: "a" }),
  ];

  it("returns input order when there are no applicable sorts", () => {
    expect(applySorts(rows, fields).map((row) => row.id)).toEqual([
      "r1",
      "r2",
      "r3",
      "r4",
    ]);
    expect(
      applySorts(rows, fields, [{ fieldId: "f-ghost", direction: "asc" }]).map(
        (row) => row.id
      )
    ).toEqual(["r1", "r2", "r3", "r4"]);
  });

  it("sorts ascending with empties last", () => {
    expect(
      applySorts(rows, fields, [
        { fieldId: amountField.id, direction: "asc" },
      ]).map((row) => row.id)
    ).toEqual(["r3", "r4", "r1", "r2"]);
  });

  it("keeps empties last when sorting descending", () => {
    expect(
      applySorts(rows, fields, [
        { fieldId: amountField.id, direction: "desc" },
      ]).map((row) => row.id)
    ).toEqual(["r1", "r4", "r3", "r2"]);
  });

  it("applies multiple keys in order, stably", () => {
    expect(
      applySorts(rows, fields, [
        { fieldId: nameField.id, direction: "asc" },
        { fieldId: amountField.id, direction: "desc" },
      ]).map((row) => row.id)
    ).toEqual(["r4", "r3", "r2", "r1"]);
  });

  it("is stable for fully tied rows", () => {
    const tied = [
      makeRow("t1", { [nameField.id]: "same" }),
      makeRow("t2", { [nameField.id]: "SAME" }),
    ];
    expect(
      applySorts(tied, fields, [
        { fieldId: nameField.id, direction: "asc" },
      ]).map((row) => row.id)
    ).toEqual(["t1", "t2"]);
  });
});

describe("compareManualOrder", () => {
  it("orders by sparse order key with missing-order rows last", () => {
    const rows = [
      makeRow("r-none", {}),
      makeRow("r-two", {}, { order: 2 }),
      makeRow("r-one", {}, { order: 1 }),
    ];
    expect([...rows].sort(compareManualOrder).map((row) => row.id)).toEqual([
      "r-one",
      "r-two",
      "r-none",
    ]);
  });

  it("breaks ties by createdAt, then id", () => {
    const older = makeRow("b", {}, { createdAt: "2026-01-01T00:00:00.000Z" });
    const newer = makeRow("a", {}, { createdAt: "2026-02-01T00:00:00.000Z" });
    expect(compareManualOrder(older, newer)).toBeLessThan(0);
    const twinA = makeRow("a", {});
    const twinB = makeRow("b", {});
    expect(compareManualOrder(twinA, twinB)).toBeLessThan(0);
    expect(compareManualOrder(twinA, twinA)).toBe(0);
  });
});

describe("sortRowsForView", () => {
  const rows = [
    makeRow("r1", { [amountField.id]: 20 }, { order: 2 }),
    makeRow("r2", { [amountField.id]: 10 }, { order: 1 }),
  ];

  it("uses view sorts when present", () => {
    const view = makeView({
      sorts: [{ fieldId: amountField.id, direction: "desc" }],
    });
    expect(sortRowsForView(rows, fields, view).map((row) => row.id)).toEqual([
      "r1",
      "r2",
    ]);
  });

  it("falls back to manual order without sorts", () => {
    expect(
      sortRowsForView(rows, fields, makeView()).map((row) => row.id)
    ).toEqual(["r2", "r1"]);
  });
});
