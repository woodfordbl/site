import { describe, expect, it } from "vitest";

import {
  computeAggregate,
  formatAggregateValue,
} from "@/lib/databases/row-aggregate.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
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

  it("formats earliest/latest via the field's date format", () => {
    expect(formatAggregateValue("earliest", dueField, "2026-05-01")).toBe(
      "May 1, 2026"
    );
  });

  it("renders null results as empty strings", () => {
    expect(formatAggregateValue("sum", amountField, null)).toBe("");
    expect(formatAggregateValue("latest", dueField, null)).toBe("");
  });
});
