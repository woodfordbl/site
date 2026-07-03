import { describe, expect, it } from "vitest";

import {
  applyFilter,
  rowMatchesCondition,
} from "@/lib/databases/row-filter.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseFilterCondition,
  DatabaseFilterGroup,
  DatabaseFilterOperator,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

const nameField: DatabaseField = { id: "f-name", name: "Name", type: "text" };

const amountField: DatabaseField = {
  id: "f-amount",
  name: "Amount",
  type: "number",
};

const doneField: DatabaseField = {
  id: "f-done",
  name: "Done",
  type: "checkbox",
};

const statusField: DatabaseField = {
  id: "f-status",
  name: "Status",
  type: "select",
  options: [
    { id: "opt-a", name: "Active" },
    { id: "opt-p", name: "Paused" },
  ],
};

const tagsField: DatabaseField = {
  id: "f-tags",
  name: "Tags",
  type: "multiSelect",
  options: [
    { id: "opt-x", name: "Alpha" },
    { id: "opt-y", name: "Beta" },
  ],
};

const dueField: DatabaseField = { id: "f-due", name: "Due", type: "date" };

const fields = [
  nameField,
  amountField,
  doneField,
  statusField,
  tagsField,
  dueField,
];

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

function cond(
  fieldId: string,
  operator: DatabaseFilterOperator,
  value?: DatabaseCellValue
): DatabaseFilterCondition {
  return { id: `c-${fieldId}-${operator}`, fieldId, operator, value };
}

describe("rowMatchesCondition", () => {
  const hello = makeRow("r1", { [nameField.id]: "Hello World" });

  const stringCases: [DatabaseFilterOperator, DatabaseCellValue, boolean][] = [
    ["eq", "hello world", true],
    ["eq", "hello", false],
    ["neq", "HELLO WORLD", false],
    ["contains", "ELL", true],
    ["notContains", "ell", false],
    ["notContains", "zzz", true],
    ["startsWith", "he", true],
    ["endsWith", "WORLD", true],
    ["endsWith", "hello", false],
  ];
  it.each(
    stringCases
  )("text %s %j → %j (case-insensitive)", (operator, value, expected) => {
    expect(
      rowMatchesCondition(hello, nameField, cond(nameField.id, operator, value))
    ).toBe(expected);
  });

  const ten = makeRow("r2", { [amountField.id]: 10 });

  const numberCases: [DatabaseFilterOperator, number, boolean][] = [
    ["eq", 10, true],
    ["neq", 10, false],
    ["gt", 5, true],
    ["gt", 10, false],
    ["gte", 10, true],
    ["lt", 10, false],
    ["lte", 10, true],
  ];
  it.each(numberCases)("number %s %j → %j", (operator, value, expected) => {
    expect(
      rowMatchesCondition(
        ten,
        amountField,
        cond(amountField.id, operator, value)
      )
    ).toBe(expected);
  });

  it("fails number comparisons on empty cells but matches neq", () => {
    const empty = makeRow("r3", {});
    expect(
      rowMatchesCondition(empty, amountField, cond(amountField.id, "gt", 0))
    ).toBe(false);
    expect(
      rowMatchesCondition(empty, amountField, cond(amountField.id, "eq", 0))
    ).toBe(false);
    expect(
      rowMatchesCondition(empty, amountField, cond(amountField.id, "neq", 0))
    ).toBe(true);
  });

  it("treats a wrong-shaped cell as empty", () => {
    const bad = makeRow("r4", { [amountField.id]: "10" });
    expect(
      rowMatchesCondition(bad, amountField, cond(amountField.id, "eq", 10))
    ).toBe(false);
    expect(
      rowMatchesCondition(bad, amountField, cond(amountField.id, "isEmpty"))
    ).toBe(true);
  });

  it("compares checkboxes with missing cells as unchecked", () => {
    const checked = makeRow("r5", { [doneField.id]: true });
    const missing = makeRow("r6", {});
    expect(
      rowMatchesCondition(checked, doneField, cond(doneField.id, "eq", true))
    ).toBe(true);
    expect(
      rowMatchesCondition(missing, doneField, cond(doneField.id, "eq", false))
    ).toBe(true);
    expect(
      rowMatchesCondition(missing, doneField, cond(doneField.id, "eq", true))
    ).toBe(false);
  });

  it("matches select cells by option id", () => {
    const active = makeRow("r7", { [statusField.id]: "opt-a" });
    expect(
      rowMatchesCondition(
        active,
        statusField,
        cond(statusField.id, "eq", "opt-a")
      )
    ).toBe(true);
    expect(
      rowMatchesCondition(
        active,
        statusField,
        cond(statusField.id, "neq", "opt-p")
      )
    ).toBe(true);
  });

  it("matches multi-select contains on the option id", () => {
    const tagged = makeRow("r8", { [tagsField.id]: ["opt-x"] });
    const untagged = makeRow("r9", { [tagsField.id]: [] });
    expect(
      rowMatchesCondition(
        tagged,
        tagsField,
        cond(tagsField.id, "contains", "opt-x")
      )
    ).toBe(true);
    expect(
      rowMatchesCondition(
        tagged,
        tagsField,
        cond(tagsField.id, "notContains", "opt-y")
      )
    ).toBe(true);
    expect(
      rowMatchesCondition(
        untagged,
        tagsField,
        cond(tagsField.id, "contains", "opt-x")
      )
    ).toBe(false);
    expect(
      rowMatchesCondition(untagged, tagsField, cond(tagsField.id, "isEmpty"))
    ).toBe(true);
  });

  const due = makeRow("r10", { [dueField.id]: "2026-03-05T12:30:00.000Z" });

  const dateCases: [DatabaseFilterOperator, string, boolean][] = [
    ["eq", "2026-03-05", true],
    ["before", "2026-03-06", true],
    ["before", "2026-03-05", false],
    ["after", "2026-03-04", true],
    ["onOrBefore", "2026-03-05", true],
    ["onOrAfter", "2026-03-06", false],
  ];
  it.each(dateCases)("date %s %j → %j", (operator, value, expected) => {
    expect(
      rowMatchesCondition(due, dueField, cond(dueField.id, operator, value))
    ).toBe(expected);
  });

  it("handles isEmpty / isNotEmpty across types", () => {
    const blank = makeRow("r11", { [nameField.id]: "   " });
    expect(
      rowMatchesCondition(blank, nameField, cond(nameField.id, "isEmpty"))
    ).toBe(true);
    expect(
      rowMatchesCondition(hello, nameField, cond(nameField.id, "isNotEmpty"))
    ).toBe(true);
    expect(
      rowMatchesCondition(ten, amountField, cond(amountField.id, "isNotEmpty"))
    ).toBe(true);
  });
});

describe("applyFilter", () => {
  const rows = [
    makeRow("r1", {
      [nameField.id]: "Alpha task",
      [amountField.id]: 10,
      [statusField.id]: "opt-a",
    }),
    makeRow("r2", {
      [nameField.id]: "Beta task",
      [amountField.id]: 20,
      [statusField.id]: "opt-p",
    }),
    makeRow("r3", { [nameField.id]: "Gamma", [amountField.id]: 30 }),
  ];

  function ids(filter: DatabaseFilterGroup): string[] {
    return applyFilter(rows, fields, filter).map((row) => row.id);
  }

  it("returns all rows when there is no filter", () => {
    expect(applyFilter(rows, fields)).toHaveLength(3);
    expect(ids({ op: "and", conditions: [] })).toEqual(["r1", "r2", "r3"]);
  });

  it("requires every condition under and", () => {
    expect(
      ids({
        op: "and",
        conditions: [
          cond(nameField.id, "contains", "task"),
          cond(amountField.id, "gt", 15),
        ],
      })
    ).toEqual(["r2"]);
  });

  it("requires any condition under or", () => {
    expect(
      ids({
        op: "or",
        conditions: [
          cond(statusField.id, "eq", "opt-a"),
          cond(amountField.id, "gt", 25),
        ],
      })
    ).toEqual(["r1", "r3"]);
  });

  it("honors inner groups inside the root group", () => {
    expect(
      ids({
        op: "and",
        conditions: [
          cond(nameField.id, "isNotEmpty"),
          {
            id: "g1",
            op: "or",
            conditions: [
              cond(statusField.id, "eq", "opt-p"),
              cond(amountField.id, "eq", 30),
            ],
          },
        ],
      })
    ).toEqual(["r2", "r3"]);
  });

  it("skips conditions referencing unknown field ids", () => {
    expect(
      ids({
        op: "and",
        conditions: [
          cond("f-ghost", "eq", "anything"),
          cond(amountField.id, "gte", 20),
        ],
      })
    ).toEqual(["r2", "r3"]);
  });

  it("treats an empty inner group as matching", () => {
    expect(
      ids({
        op: "and",
        conditions: [{ id: "g2", op: "or", conditions: [] }],
      })
    ).toEqual(["r1", "r2", "r3"]);
  });
});
