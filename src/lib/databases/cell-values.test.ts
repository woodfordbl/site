import { describe, expect, it } from "vitest";

import {
  cellToPlainText,
  coerceCellValue,
  formatCellValue,
  isCellEmpty,
  toIsoDatePart,
} from "@/lib/databases/cell-values.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
} from "@/lib/schemas/database.ts";

const textField: DatabaseField = { id: "f-text", name: "Name", type: "text" };

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

const selectField: DatabaseField = {
  id: "f-status",
  name: "Status",
  type: "select",
  options: [
    { id: "opt-a", name: "Active" },
    { id: "opt-p", name: "Paused" },
  ],
};

const multiSelectField: DatabaseField = {
  id: "f-tags",
  name: "Tags",
  type: "multiSelect",
  options: [
    { id: "opt-x", name: "Alpha" },
    { id: "opt-y", name: "Beta" },
  ],
};

const dateField: DatabaseField = { id: "f-due", name: "Due", type: "date" };

describe("isCellEmpty", () => {
  const cases: [DatabaseCellValue | undefined, boolean][] = [
    [null, true],
    [undefined, true],
    ["", true],
    ["   ", true],
    ["a", false],
    [0, false],
    [false, false],
    [[], true],
    [["opt-x"], false],
  ];
  it.each(cases)("isCellEmpty(%j) → %j", (value, expected) => {
    expect(isCellEmpty(value)).toBe(expected);
  });
});

describe("toIsoDatePart", () => {
  it("keeps the date part of ISO strings", () => {
    expect(toIsoDatePart("2026-03-05")).toBe("2026-03-05");
    expect(toIsoDatePart("2026-03-05T12:30:00.000Z")).toBe("2026-03-05");
  });

  it("returns an empty string for unparseable input", () => {
    expect(toIsoDatePart("not a date")).toBe("");
    expect(toIsoDatePart("")).toBe("");
  });
});

describe("coerceCellValue", () => {
  it("nulls a string in a number field", () => {
    expect(coerceCellValue(numberField, "42")).toBeNull();
  });

  it("nulls a number in a text field", () => {
    expect(coerceCellValue(textField, 42)).toBeNull();
  });

  it("nulls an option-id array in a select field", () => {
    expect(coerceCellValue(selectField, ["opt-a"])).toBeNull();
  });

  it("nulls a bare option id in a multi-select field", () => {
    expect(coerceCellValue(multiSelectField, "opt-x")).toBeNull();
  });

  it("nulls a non-boolean in a checkbox field", () => {
    expect(coerceCellValue(checkboxField, "yes")).toBeNull();
  });

  it("nulls non-finite and unparseable values", () => {
    expect(coerceCellValue(numberField, Number.NaN)).toBeNull();
    expect(coerceCellValue(dateField, "not a date")).toBeNull();
  });

  it("passes valid values through", () => {
    expect(coerceCellValue(textField, "hi")).toBe("hi");
    expect(coerceCellValue(numberField, 3.5)).toBe(3.5);
    expect(coerceCellValue(checkboxField, true)).toBe(true);
    expect(coerceCellValue(selectField, "opt-a")).toBe("opt-a");
    expect(coerceCellValue(multiSelectField, ["opt-x"])).toEqual(["opt-x"]);
    expect(coerceCellValue(dateField, " 2026-03-05 ")).toBe("2026-03-05");
  });

  it("treats null and undefined as null", () => {
    expect(coerceCellValue(textField, null)).toBeNull();
    expect(coerceCellValue(textField, undefined)).toBeNull();
  });
});

describe("cellToPlainText", () => {
  it("resolves option ids to option names", () => {
    expect(cellToPlainText(selectField, "opt-a")).toBe("Active");
    expect(cellToPlainText(multiSelectField, ["opt-x", "opt-y"])).toBe(
      "Alpha, Beta"
    );
  });

  it("drops stale option ids", () => {
    expect(cellToPlainText(selectField, "opt-gone")).toBe("");
    expect(cellToPlainText(multiSelectField, ["opt-gone", "opt-y"])).toBe(
      "Beta"
    );
  });

  it("renders checkboxes as Yes/No and dates as ISO date parts", () => {
    expect(cellToPlainText(checkboxField, true)).toBe("Yes");
    expect(cellToPlainText(checkboxField, false)).toBe("No");
    expect(cellToPlainText(dateField, "2026-03-05T12:30:00.000Z")).toBe(
      "2026-03-05"
    );
  });

  it("renders empty and wrong-shaped cells as empty strings", () => {
    expect(cellToPlainText(textField, null)).toBe("");
    expect(cellToPlainText(numberField, "42")).toBe("");
  });
});

describe("formatCellValue", () => {
  it("formats numbers per field format", () => {
    expect(formatCellValue(numberField, 1234.5)).toBe("1,234.5");
    expect(formatCellValue({ ...numberField, format: "integer" }, 3.7)).toBe(
      "4"
    );
    expect(formatCellValue({ ...numberField, format: "percent" }, 0.42)).toBe(
      "42%"
    );
    expect(
      formatCellValue({ ...numberField, format: "currency" }, 1234.5)
    ).toBe("$1,234.50");
  });

  it("formats dates for display", () => {
    expect(formatCellValue(dateField, "2026-03-05")).toBe("Mar 5, 2026");
    expect(formatCellValue(dateField, "2026-03-05T23:59:00.000Z")).toBe(
      "Mar 5, 2026"
    );
  });

  it("falls back to plain text and empty strings", () => {
    expect(formatCellValue(selectField, "opt-p")).toBe("Paused");
    expect(formatCellValue(numberField, "oops")).toBe("");
    expect(formatCellValue(textField, null)).toBe("");
  });
});
