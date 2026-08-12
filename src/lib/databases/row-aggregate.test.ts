import { describe, expect, it } from "vitest";

import {
  computeAggregate,
  formatAggregateValue,
} from "@/lib/databases/row-aggregate.ts";
import { groupRowsForView } from "@/lib/databases/row-group.ts";
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

const dueField: DatabaseField = { id: "f-due", name: "Due", type: "date" };

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

function numberRows(values: (number | null)[]): LocalDatabaseRow[] {
  return values.map((value, index) =>
    makeRow(`r${index}`, value === null ? {} : { [amountField.id]: value })
  );
}

describe("computeAggregate — counts", () => {
  const rows = [
    makeRow("r1", { [nameField.id]: "alpha" }),
    makeRow("r2", { [nameField.id]: "alpha" }),
    makeRow("r3", { [nameField.id]: "beta" }),
    makeRow("r4", { [nameField.id]: "" }),
  ];

  it("counts all, values, empty, not empty", () => {
    expect(computeAggregate("countAll", nameField, rows)).toBe(4);
    expect(computeAggregate("countValues", nameField, rows)).toBe(3);
    expect(computeAggregate("countNotEmpty", nameField, rows)).toBe(3);
    expect(computeAggregate("countEmpty", nameField, rows)).toBe(1);
  });

  it("counts unique plain-text projections", () => {
    expect(computeAggregate("countUnique", nameField, rows)).toBe(2);
  });

  it("counts identical multi-select sets stored in different orders as one value", () => {
    // Must agree with grouping, which normalizes ids to field option order.
    const tagsField: DatabaseField = {
      id: "f-tags",
      name: "Tags",
      type: "multiSelect",
      options: [
        { id: "opt-x", name: "Alpha" },
        { id: "opt-y", name: "Beta" },
      ],
    };
    const tagRows = [
      makeRow("t1", { [tagsField.id]: ["opt-x", "opt-y"] }),
      makeRow("t2", { [tagsField.id]: ["opt-y", "opt-x"] }),
    ];
    expect(computeAggregate("countUnique", tagsField, tagRows)).toBe(1);
  });

  it("returns percent fractions between 0 and 1", () => {
    expect(computeAggregate("percentEmpty", nameField, rows)).toBe(0.25);
    expect(computeAggregate("percentNotEmpty", nameField, rows)).toBe(0.75);
    expect(computeAggregate("percentEmpty", nameField, [])).toBe(0);
    expect(computeAggregate("percentNotEmpty", nameField, [])).toBe(0);
  });
});

describe("computeAggregate — numbers", () => {
  it("sums, averages, and bounds numeric cells (ignoring empties)", () => {
    const rows = numberRows([10, null, 20, 30]);
    expect(computeAggregate("sum", amountField, rows)).toBe(60);
    expect(computeAggregate("average", amountField, rows)).toBe(20);
    expect(computeAggregate("min", amountField, rows)).toBe(10);
    expect(computeAggregate("max", amountField, rows)).toBe(30);
    expect(computeAggregate("range", amountField, rows)).toBe(20);
  });

  it("computes the median for odd and even counts", () => {
    expect(computeAggregate("median", amountField, numberRows([3, 1, 2]))).toBe(
      2
    );
    expect(
      computeAggregate("median", amountField, numberRows([4, 1, 3, 2]))
    ).toBe(2.5);
  });

  it("handles empty inputs: sum 0, other reducers null", () => {
    expect(computeAggregate("sum", amountField, [])).toBe(0);
    expect(computeAggregate("average", amountField, [])).toBeNull();
    expect(computeAggregate("median", amountField, [])).toBeNull();
    expect(computeAggregate("min", amountField, [])).toBeNull();
    expect(computeAggregate("range", amountField, [])).toBeNull();
  });

  it("returns null for numeric reducers on non-number fields", () => {
    const rows = [makeRow("r1", { [nameField.id]: "10" })];
    expect(computeAggregate("sum", nameField, rows)).toBeNull();
    expect(computeAggregate("median", nameField, rows)).toBeNull();
  });
});

describe("computeAggregate — dates", () => {
  const rows = [
    makeRow("r1", { [dueField.id]: "2026-05-01" }),
    makeRow("r2", { [dueField.id]: "2026-01-15T09:00:00.000Z" }),
    makeRow("r3", {}),
  ];

  it("returns the winning cell's ISO string", () => {
    expect(computeAggregate("earliest", dueField, rows)).toBe(
      "2026-01-15T09:00:00.000Z"
    );
    expect(computeAggregate("latest", dueField, rows)).toBe("2026-05-01");
  });

  it("returns null on non-date fields or empty inputs", () => {
    expect(computeAggregate("earliest", amountField, rows)).toBeNull();
    expect(computeAggregate("latest", dueField, [])).toBeNull();
  });
});

describe("computeAggregate — list-valued formula cells", () => {
  // Merged formula cells: a LIST result projects to its elements' display
  // strings (formula-engine/project.ts); an evaluation error is the
  // single-element "⚠ …" marker. Scalars stay scalars.
  const rollupField: DatabaseField = {
    id: "f-roll",
    name: "Rollup",
    type: "formula",
    expression: 'prop("Items")',
  };
  const rows = [
    makeRow("r1", { [rollupField.id]: ["1,000", "2"] }),
    makeRow("r2", { [rollupField.id]: 5 }),
    makeRow("r3", { [rollupField.id]: ["Yes", "3.5"] }),
    makeRow("r4", { [rollupField.id]: [] }),
    makeRow("r5", { [rollupField.id]: ["⚠ Division by zero"] }),
    makeRow("r6", {}),
  ];

  it("flattens numeric list elements into the numeric reducers", () => {
    // Numeric data: 1000, 2 (r1) + 5 (r2) + 3.5 (r3; "Yes" skipped).
    expect(computeAggregate("sum", rollupField, rows)).toBe(1010.5);
    expect(computeAggregate("average", rollupField, rows)).toBe(1010.5 / 4);
    expect(computeAggregate("min", rollupField, rows)).toBe(2);
    expect(computeAggregate("max", rollupField, rows)).toBe(1000);
    expect(computeAggregate("median", rollupField, rows)).toBe((3.5 + 5) / 2);
    expect(computeAggregate("range", rollupField, rows)).toBe(998);
  });

  it("counts a non-empty list as one value; empty lists and errors as empty", () => {
    expect(computeAggregate("countValues", rollupField, rows)).toBe(3);
    expect(computeAggregate("countNotEmpty", rollupField, rows)).toBe(3);
    expect(computeAggregate("countEmpty", rollupField, rows)).toBe(3);
    expect(computeAggregate("percentNotEmpty", rollupField, rows)).toBe(0.5);
    expect(computeAggregate("percentEmpty", rollupField, rows)).toBe(0.5);
    expect(computeAggregate("countAll", rollupField, rows)).toBe(6);
  });

  it("dedupes identical lists as one unique value keyed by joined text", () => {
    const uniqueRows = [
      makeRow("u1", { [rollupField.id]: ["a", "b"] }),
      makeRow("u2", { [rollupField.id]: ["a", "b"] }),
      makeRow("u3", { [rollupField.id]: ["b", "a"] }),
      makeRow("u4", { [rollupField.id]: "a" }),
      makeRow("u5", { [rollupField.id]: [] }),
    ];
    // ["a","b"], ["b","a"] (order-sensitive), and scalar "a".
    expect(computeAggregate("countUnique", rollupField, uniqueRows)).toBe(3);
  });

  it("keeps multiSelect/relation id arrays out of the list path", () => {
    const tagsField: DatabaseField = {
      id: "f-tags",
      name: "Tags",
      type: "multiSelect",
      options: [{ id: "opt-x", name: "Alpha" }],
    };
    const tagRows = [makeRow("t1", { [tagsField.id]: ["opt-x"] })];
    // Numeric reducers still refuse non-number fields even with arrays.
    expect(computeAggregate("sum", tagsField, tagRows)).toBeNull();
    expect(computeAggregate("countValues", tagsField, tagRows)).toBe(1);
  });
});

describe("computeAggregate — per-group row subsets", () => {
  it("aggregates each group bucket over exactly its own rows", () => {
    const statusField: DatabaseField = {
      id: "f-status",
      name: "Status",
      type: "select",
      options: [
        { id: "opt-a", name: "Alpha" },
        { id: "opt-b", name: "Beta" },
      ],
    };
    const fields = [statusField, amountField];
    const view: DatabaseView = {
      id: "v-1",
      name: "All",
      type: "table",
      groupBy: { fieldId: statusField.id },
      config: {},
    };
    const rows = [
      makeRow("r1", { [statusField.id]: "opt-a", [amountField.id]: 1 }),
      makeRow("r2", { [statusField.id]: "opt-b", [amountField.id]: 5 }),
      makeRow("r3", { [statusField.id]: "opt-a", [amountField.id]: 2 }),
    ];
    const groups = groupRowsForView(rows, fields, view);
    const sums = groups.map((group) => [
      group.label,
      computeAggregate("sum", amountField, group.rows),
    ]);
    expect(sums).toEqual([
      ["Alpha", 3],
      ["Beta", 5],
    ]);
    // The whole-table footer keeps aggregating over every filtered row.
    expect(computeAggregate("sum", amountField, rows)).toBe(8);
  });
});

describe("formatAggregateValue", () => {
  it("formats percents as whole-number percentages", () => {
    expect(formatAggregateValue("percentNotEmpty", nameField, 0.42)).toBe(
      "42%"
    );
    expect(formatAggregateValue("percentEmpty", nameField, 0)).toBe("0%");
  });

  it("formats counts as plain integers", () => {
    expect(formatAggregateValue("countAll", nameField, 5)).toBe("5");
    expect(formatAggregateValue("countUnique", nameField, 0)).toBe("0");
  });

  it("formats numeric reducers via the field's number format", () => {
    const currency: DatabaseField = { ...amountField, format: "currency" };
    expect(formatAggregateValue("sum", currency, 1234.5)).toBe("$1,234.50");
    expect(formatAggregateValue("average", amountField, 1234.5)).toBe(
      "1,234.5"
    );
  });

  it("inherits the field's decimals and grouping display config", () => {
    const twoDecimals: DatabaseField = { ...amountField, decimals: 2 };
    expect(formatAggregateValue("sum", twoDecimals, 1234.5)).toBe("1,234.50");
    expect(formatAggregateValue("average", twoDecimals, 20)).toBe("20.00");
    expect(formatAggregateValue("range", twoDecimals, 0.125)).toBe("0.13");
    const ungrouped: DatabaseField = { ...amountField, useGrouping: false };
    expect(formatAggregateValue("max", ungrouped, 1234.5)).toBe("1234.5");
  });

  it("formats earliest/latest via the field's date format", () => {
    expect(formatAggregateValue("earliest", dueField, "2026-05-01")).toBe(
      "May 1, 2026"
    );
    const longField: DatabaseField = { ...dueField, format: "long" };
    expect(formatAggregateValue("earliest", longField, "2026-01-15")).toBe(
      "January 15, 2026"
    );
    const isoField: DatabaseField = { ...dueField, format: "iso" };
    expect(formatAggregateValue("latest", isoField, "2026-05-01")).toBe(
      "2026-05-01"
    );
  });

  it("falls back to the default date display for relative-format fields", () => {
    // "3 days ago" beside an Earliest label reads oddly in the footer.
    const relativeField: DatabaseField = { ...dueField, format: "relative" };
    expect(formatAggregateValue("earliest", relativeField, "2026-05-01")).toBe(
      "May 1, 2026"
    );
    expect(formatAggregateValue("latest", relativeField, "2026-05-01")).toBe(
      "May 1, 2026"
    );
  });

  it("renders null results as empty strings", () => {
    expect(formatAggregateValue("sum", amountField, null)).toBe("");
    expect(formatAggregateValue("latest", dueField, null)).toBe("");
  });
});
