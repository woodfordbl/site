import { describe, expect, it } from "vitest";

import {
  groupKeyForRow,
  groupRowsForView,
  isGroupableField,
  resolveGroupByField,
} from "@/lib/databases/row-group.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseView,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

const textField: DatabaseField = { id: "f-text", name: "Notes", type: "text" };

const numberField: DatabaseField = {
  id: "f-num",
  name: "Amount",
  type: "number",
};

const checkboxField: DatabaseField = {
  id: "f-done",
  name: "Done",
  type: "checkbox",
};

const dateField: DatabaseField = { id: "f-due", name: "Due", type: "date" };

const selectField: DatabaseField = {
  id: "f-status",
  name: "Status",
  type: "select",
  options: [
    { id: "opt-todo", name: "Todo", color: "blue" },
    { id: "opt-doing", name: "Doing" },
    { id: "opt-done", name: "Done", color: "green" },
  ],
};

const multiSelectField: DatabaseField = {
  id: "f-tags",
  name: "Tags",
  type: "multiSelect",
  options: [
    { id: "opt-a", name: "Alpha" },
    { id: "opt-b", name: "Beta" },
  ],
};

const formulaField: DatabaseField = {
  id: "f-formula",
  name: "Computed",
  type: "formula",
  expression: "1 + 1",
};

function makeView(groupByFieldId?: string): DatabaseView {
  return {
    id: "v1",
    name: "Table",
    type: "table",
    groupBy: groupByFieldId ? { fieldId: groupByFieldId } : undefined,
    config: {},
  };
}

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

const ALL_FIELDS = [
  textField,
  numberField,
  checkboxField,
  dateField,
  selectField,
  multiSelectField,
  formulaField,
];

describe("isGroupableField", () => {
  it("allows every type except formula", () => {
    expect(isGroupableField(textField)).toBe(true);
    expect(isGroupableField(numberField)).toBe(true);
    expect(isGroupableField(checkboxField)).toBe(true);
    expect(isGroupableField(dateField)).toBe(true);
    expect(isGroupableField(selectField)).toBe(true);
    expect(isGroupableField(multiSelectField)).toBe(true);
    expect(isGroupableField(formulaField)).toBe(false);
  });
});

describe("resolveGroupByField", () => {
  it("resolves a groupable field and rejects stale/formula/ungrouped views", () => {
    expect(resolveGroupByField(ALL_FIELDS, makeView(selectField.id))).toBe(
      selectField
    );
    expect(resolveGroupByField(ALL_FIELDS, makeView())).toBeNull();
    expect(resolveGroupByField(ALL_FIELDS, makeView("f-gone"))).toBeNull();
    expect(
      resolveGroupByField(ALL_FIELDS, makeView(formulaField.id))
    ).toBeNull();
  });
});

describe("groupKeyForRow", () => {
  it("keys empty cells to the empty-group key", () => {
    expect(groupKeyForRow(textField, null)).toBe("");
    expect(groupKeyForRow(textField, "   ")).toBe("");
    expect(groupKeyForRow(multiSelectField, [])).toBe("");
    expect(groupKeyForRow(selectField, undefined)).toBe("");
  });

  it("keys per field type", () => {
    expect(groupKeyForRow(textField, "  hello ")).toBe("hello");
    expect(groupKeyForRow(numberField, 42)).toBe("42");
    expect(groupKeyForRow(checkboxField, true)).toBe("true");
    expect(groupKeyForRow(checkboxField, false)).toBe("false");
    expect(groupKeyForRow(selectField, "opt-doing")).toBe("opt-doing");
    expect(groupKeyForRow(dateField, "2026-03-05T12:00:00Z")).toBe(
      "2026-03-05"
    );
  });

  it("keys multi-select combinations in field option order", () => {
    expect(groupKeyForRow(multiSelectField, ["opt-b", "opt-a"])).toBe(
      "opt-a,opt-b"
    );
    expect(groupKeyForRow(multiSelectField, ["opt-a", "opt-b"])).toBe(
      "opt-a,opt-b"
    );
  });

  it("collapses wrong-shaped values to the empty key", () => {
    expect(groupKeyForRow(numberField, "nope")).toBe("");
    expect(groupKeyForRow(checkboxField, "true")).toBe("");
  });
});

describe("groupRowsForView — select", () => {
  const rows = [
    makeRow("r1", { [selectField.id]: "opt-done" }),
    makeRow("r2", {}),
    makeRow("r3", { [selectField.id]: "opt-todo" }),
    makeRow("r4", { [selectField.id]: "opt-stale" }),
    makeRow("r5", { [selectField.id]: "opt-todo" }),
  ];

  it("orders by option order, then unknown ids, empty last", () => {
    const groups = groupRowsForView(rows, ALL_FIELDS, makeView(selectField.id));
    expect(groups.map((group) => group.key)).toEqual([
      "opt-todo",
      "opt-done",
      "opt-stale",
      "",
    ]);
  });

  it("labels via option name with color, 'No <field>' for empty", () => {
    const groups = groupRowsForView(rows, ALL_FIELDS, makeView(selectField.id));
    expect(groups[0]).toMatchObject({
      label: "Todo",
      color: "blue",
      value: "opt-todo",
    });
    expect(groups[1]).toMatchObject({ label: "Done", color: "green" });
    // Stale option id: the raw id is the honest label, no color.
    expect(groups[2]).toMatchObject({ label: "opt-stale", color: undefined });
    expect(groups[3]).toMatchObject({
      key: "",
      label: "No Status",
      value: null,
    });
  });

  it("preserves intra-group input order", () => {
    const groups = groupRowsForView(rows, ALL_FIELDS, makeView(selectField.id));
    expect(groups[0].rows.map((row) => row.id)).toEqual(["r3", "r5"]);
  });
});

describe("groupRowsForView — other types", () => {
  it("orders checkbox groups true-first with formatted labels", () => {
    const rows = [
      makeRow("r1", { [checkboxField.id]: false }),
      makeRow("r2", { [checkboxField.id]: true }),
    ];
    const groups = groupRowsForView(
      rows,
      ALL_FIELDS,
      makeView(checkboxField.id)
    );
    expect(groups.map((group) => group.key)).toEqual(["true", "false"]);
    expect(groups.map((group) => group.label)).toEqual(["Yes", "No"]);
    expect(groups.map((group) => group.value)).toEqual([true, false]);
  });

  it("orders number groups numerically with formatted labels", () => {
    const rows = [
      makeRow("r1", { [numberField.id]: 100 }),
      makeRow("r2", { [numberField.id]: 2 }),
      makeRow("r3", {}),
    ];
    const groups = groupRowsForView(rows, ALL_FIELDS, makeView(numberField.id));
    expect(groups.map((group) => group.key)).toEqual(["2", "100", ""]);
    expect(groups[0].value).toBe(2);
  });

  it("orders date groups chronologically with display labels", () => {
    const rows = [
      makeRow("r1", { [dateField.id]: "2026-06-15" }),
      makeRow("r2", { [dateField.id]: "2026-01-02" }),
    ];
    const groups = groupRowsForView(rows, ALL_FIELDS, makeView(dateField.id));
    expect(groups.map((group) => group.key)).toEqual([
      "2026-01-02",
      "2026-06-15",
    ]);
    expect(groups[0].label).toBe("Jan 2, 2026");
  });

  it("orders text groups by collated value", () => {
    const rows = [
      makeRow("r1", { [textField.id]: "banana" }),
      makeRow("r2", { [textField.id]: "Apple" }),
    ];
    const groups = groupRowsForView(rows, ALL_FIELDS, makeView(textField.id));
    expect(groups.map((group) => group.label)).toEqual(["Apple", "banana"]);
  });

  it("buckets multi-select combinations with joined labels", () => {
    const rows = [
      makeRow("r1", { [multiSelectField.id]: ["opt-b", "opt-a"] }),
      makeRow("r2", { [multiSelectField.id]: ["opt-a", "opt-b"] }),
      makeRow("r3", { [multiSelectField.id]: ["opt-b"] }),
    ];
    const groups = groupRowsForView(
      rows,
      ALL_FIELDS,
      makeView(multiSelectField.id)
    );
    expect(groups.map((group) => group.key)).toEqual(["opt-a,opt-b", "opt-b"]);
    expect(groups[0].label).toBe("Alpha, Beta");
    expect(groups[0].rows.map((row) => row.id)).toEqual(["r1", "r2"]);
    expect(groups[0].value).toEqual(["opt-a", "opt-b"]);
  });

  it("returns [] for ungrouped or unresolvable views", () => {
    const rows = [makeRow("r1", {})];
    expect(groupRowsForView(rows, ALL_FIELDS, makeView())).toEqual([]);
    expect(
      groupRowsForView(rows, ALL_FIELDS, makeView(formulaField.id))
    ).toEqual([]);
  });
});
