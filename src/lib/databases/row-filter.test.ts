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

const formulaField: DatabaseField = {
  id: "f-calc",
  name: "Calc",
  type: "formula",
  expression: "thisPage.Amount * 2",
};

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

  describe("between", () => {
    function matchesBetween(
      cellIso: string | undefined,
      value?: DatabaseCellValue
    ): boolean {
      const row =
        cellIso === undefined
          ? makeRow("rb", {})
          : makeRow("rb", { [dueField.id]: cellIso });
      return rowMatchesCondition(
        row,
        dueField,
        cond(dueField.id, "between", value)
      );
    }

    it("includes both bounds (inclusive start ≤ cell ≤ end)", () => {
      const range = ["2026-03-01", "2026-03-31"];
      expect(matchesBetween("2026-03-01", range)).toBe(true);
      expect(matchesBetween("2026-03-15", range)).toBe(true);
      expect(matchesBetween("2026-03-31", range)).toBe(true);
      expect(matchesBetween("2026-02-28", range)).toBe(false);
      expect(matchesBetween("2026-04-01", range)).toBe(false);
    });

    it("normalizes swapped bounds to min/max", () => {
      expect(matchesBetween("2026-03-15", ["2026-03-31", "2026-03-01"])).toBe(
        true
      );
      expect(matchesBetween("2026-04-01", ["2026-03-31", "2026-03-01"])).toBe(
        false
      );
    });

    it("compares on ISO date parts of timestamp bounds and cells", () => {
      expect(
        matchesBetween("2026-03-05T23:59:00.000Z", [
          "2026-03-05T00:00:00.000Z",
          "2026-03-05",
        ])
      ).toBe(true);
    });

    it("never matches an empty cell", () => {
      expect(matchesBetween(undefined, ["2026-03-01", "2026-03-31"])).toBe(
        false
      );
    });

    it("skips the condition (fail-open) on malformed values", () => {
      expect(matchesBetween("2026-03-05", undefined)).toBe(true);
      expect(matchesBetween("2026-03-05", "2026-03-01")).toBe(true);
      expect(matchesBetween("2026-03-05", ["2026-03-01"])).toBe(true);
      expect(
        matchesBetween("2026-03-05", ["2026-03-01", "2026-03-02", "2026-03-03"])
      ).toBe(true);
      expect(matchesBetween("2026-03-05", ["not a date", "2026-03-31"])).toBe(
        true
      );
    });
  });

  describe("relative date windows (fixed local clock)", () => {
    // Wednesday, March 18, 2026 at noon LOCAL time — windows derive from
    // local date parts, matching `toIsoDatePart`.
    const now = () => new Date(2026, 2, 18, 12, 0, 0);

    function matchesRelative(
      operator: DatabaseFilterOperator,
      cellIso: string | undefined
    ): boolean {
      const row =
        cellIso === undefined
          ? makeRow("rr", {})
          : makeRow("rr", { [dueField.id]: cellIso });
      return rowMatchesCondition(row, dueField, cond(dueField.id, operator), {
        now,
      });
    }

    const windowCases: [DatabaseFilterOperator, string, string][] = [
      ["pastDay", "2026-03-17", "2026-03-18"],
      ["pastWeek", "2026-03-11", "2026-03-18"],
      ["pastMonth", "2026-02-18", "2026-03-18"],
      ["pastYear", "2025-03-18", "2026-03-18"],
      // date-fns default locale: weeks run Sunday..Saturday.
      ["thisWeek", "2026-03-15", "2026-03-21"],
      ["thisMonth", "2026-03-01", "2026-03-31"],
      ["nextWeek", "2026-03-22", "2026-03-28"],
      ["nextMonth", "2026-04-01", "2026-04-30"],
    ];
    it.each(
      windowCases
    )("%s spans [%s, %s] inclusive", (operator, start, end) => {
      expect(matchesRelative(operator, start)).toBe(true);
      expect(matchesRelative(operator, end)).toBe(true);
    });

    it("excludes days just outside each window", () => {
      expect(matchesRelative("pastDay", "2026-03-16")).toBe(false);
      expect(matchesRelative("pastDay", "2026-03-19")).toBe(false);
      expect(matchesRelative("pastWeek", "2026-03-10")).toBe(false);
      expect(matchesRelative("pastMonth", "2026-02-17")).toBe(false);
      expect(matchesRelative("pastYear", "2025-03-17")).toBe(false);
      expect(matchesRelative("thisWeek", "2026-03-14")).toBe(false);
      expect(matchesRelative("thisWeek", "2026-03-22")).toBe(false);
      expect(matchesRelative("thisMonth", "2026-04-01")).toBe(false);
      expect(matchesRelative("nextWeek", "2026-03-21")).toBe(false);
      expect(matchesRelative("nextWeek", "2026-03-29")).toBe(false);
      expect(matchesRelative("nextMonth", "2026-03-31")).toBe(false);
      expect(matchesRelative("nextMonth", "2026-05-01")).toBe(false);
    });

    it("clamps calendar-unit subtraction at short months", () => {
      // March 31 − 1 month clamps to Feb 28 (2026 is not a leap year).
      const eom = () => new Date(2026, 2, 31, 12, 0, 0);
      const inWindow = makeRow("rc", { [dueField.id]: "2026-02-28" });
      const outside = makeRow("rc2", { [dueField.id]: "2026-02-27" });
      expect(
        rowMatchesCondition(
          inWindow,
          dueField,
          cond(dueField.id, "pastMonth"),
          {
            now: eom,
          }
        )
      ).toBe(true);
      expect(
        rowMatchesCondition(outside, dueField, cond(dueField.id, "pastMonth"), {
          now: eom,
        })
      ).toBe(false);
    });

    it("never matches an empty cell", () => {
      expect(matchesRelative("thisMonth", undefined)).toBe(false);
      expect(matchesRelative("pastYear", undefined)).toBe(false);
    });

    it("defaults to the real clock when no now is injected", () => {
      const todayRow = makeRow("rt", {
        [dueField.id]: new Date().toISOString(),
      });
      expect(
        rowMatchesCondition(todayRow, dueField, cond(dueField.id, "pastDay"))
      ).toBe(true);
    });
  });

  describe("formula cells filter on display text", () => {
    // Formula values are computed and merged into row.values at read time;
    // string operators must match the text the grid renders for the cell.
    const numeric = makeRow("rf1", { [formulaField.id]: 84 });
    const grouped = makeRow("rf2", { [formulaField.id]: 1234.5 });
    const boolTrue = makeRow("rf3", { [formulaField.id]: true });
    const text = makeRow("rf4", { [formulaField.id]: "Hello World" });

    function matches(
      row: LocalDatabaseRow,
      operator: DatabaseFilterOperator,
      value?: DatabaseCellValue
    ): boolean {
      return rowMatchesCondition(
        row,
        formulaField,
        cond(formulaField.id, operator, value)
      );
    }

    it("matches numeric results against their displayed text", () => {
      expect(matches(numeric, "eq", "84")).toBe(true);
      expect(matches(numeric, "neq", "84")).toBe(false);
      expect(matches(numeric, "contains", "8")).toBe(true);
      expect(matches(numeric, "startsWith", "8")).toBe(true);
      expect(matches(numeric, "eq", "85")).toBe(false);
    });

    it("matches grouped number display (Intl en-US, like the grid)", () => {
      expect(matches(grouped, "eq", "1,234.5")).toBe(true);
      expect(matches(grouped, "contains", "234")).toBe(true);
    });

    it("matches boolean results as Yes/No, case-insensitively", () => {
      expect(matches(boolTrue, "eq", "yes")).toBe(true);
      expect(matches(boolTrue, "eq", "no")).toBe(false);
      expect(matches(boolTrue, "neq", "no")).toBe(true);
    });

    it("keeps string results and emptiness semantics unchanged", () => {
      expect(matches(text, "contains", "world")).toBe(true);
      expect(matches(numeric, "isNotEmpty")).toBe(true);
      expect(matches(makeRow("rf5", {}), "isEmpty")).toBe(true);
    });
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

  it("threads the injected clock down to relative date conditions", () => {
    const datedRows = [
      makeRow("d1", { [dueField.id]: "2026-03-02" }),
      makeRow("d2", { [dueField.id]: "2026-04-10" }),
    ];
    const filter: DatabaseFilterGroup = {
      op: "and",
      conditions: [cond(dueField.id, "thisMonth")],
    };
    // March 18, 2026 → only the March row is "this month".
    const march = applyFilter(datedRows, fields, filter, {
      now: () => new Date(2026, 2, 18, 12, 0, 0),
    });
    expect(march.map((row) => row.id)).toEqual(["d1"]);
    // One month later the same filter matches the April row instead.
    const april = applyFilter(datedRows, fields, filter, {
      now: () => new Date(2026, 3, 18, 12, 0, 0),
    });
    expect(april.map((row) => row.id)).toEqual(["d2"]);
  });
});
