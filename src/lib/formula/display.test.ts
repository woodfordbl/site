import { describe, expect, it } from "vitest";

import type { FormulaNode } from "@/lib/formula/ast.ts";
import {
  formulaDateToDisplay,
  formulaValueToDisplay,
  formulaValueToText,
} from "@/lib/formula/display.ts";
import {
  FormulaDate,
  type FormulaError,
  FormulaLambda,
  FormulaRowRef,
  formulaError,
  LAMBDA_AS_VALUE_MESSAGE,
} from "@/lib/formula/values.ts";

const LITERAL_ONE: FormulaNode = {
  kind: "literal",
  value: 1,
  position: 0,
  end: 1,
};

// Local-time construction keeps date assertions timezone-independent.
const MARCH_5 = new FormulaDate(new Date(2026, 2, 5), true);
const MARCH_5_TIME = new FormulaDate(new Date(2026, 2, 5, 10, 30), false);

describe("formulaValueToDisplay", () => {
  it("renders scalars with v1 rules", () => {
    expect(formulaValueToDisplay(1234.5)).toBe("1,234.5");
    expect(formulaValueToDisplay(1.123_456_789)).toBe("1.123457");
    expect(formulaValueToDisplay(true)).toBe("Yes");
    expect(formulaValueToDisplay(false)).toBe("No");
    expect(formulaValueToDisplay(null)).toBe("");
    expect(formulaValueToDisplay("x")).toBe("x");
  });

  it("renders dates as yyyy-mm-dd, with HH:mm when time-bearing", () => {
    expect(formulaValueToDisplay(MARCH_5)).toBe("2026-03-05");
    expect(formulaValueToDisplay(MARCH_5_TIME)).toBe("2026-03-05 10:30");
  });

  it("renders lists comma-joined with recursive element displays", () => {
    expect(formulaValueToDisplay([1, "a", true, null])).toBe("1, a, Yes, ");
    expect(formulaValueToDisplay([])).toBe("");
    expect(formulaValueToDisplay([MARCH_5, 2000])).toBe("2026-03-05, 2,000");
  });

  it("renders rows, lambdas, and errors as placeholders", () => {
    expect(formulaValueToDisplay(new FormulaRowRef("db", "row"))).toBe("[row]");
    expect(
      formulaValueToDisplay(new FormulaLambda(["x"], LITERAL_ONE, null))
    ).toBe("ƒ");
    expect(formulaValueToDisplay(formulaError("Division by zero"))).toBe(
      "⚠ Division by zero"
    );
  });

  it("labels rows through opts.rowLabel, recursively inside lists", () => {
    const rowLabel = (ref: FormulaRowRef) => `Row ${ref.rowId}`;
    expect(
      formulaValueToDisplay(new FormulaRowRef("db", "r1"), { rowLabel })
    ).toBe("Row r1");
    expect(
      formulaValueToDisplay(
        [new FormulaRowRef("db", "r1"), new FormulaRowRef("db", "r2")],
        { rowLabel }
      )
    ).toBe("Row r1, Row r2");
  });
});

describe("formulaDateToDisplay", () => {
  it("respects the dateOnly flag", () => {
    expect(formulaDateToDisplay(MARCH_5)).toBe("2026-03-05");
    expect(formulaDateToDisplay(MARCH_5_TIME)).toBe("2026-03-05 10:30");
  });
});

describe("formulaValueToText", () => {
  it("coerces scalars with v1 rules (String, not display formatting)", () => {
    expect(formulaValueToText(null)).toBe("");
    expect(formulaValueToText(1234.5)).toBe("1234.5");
    expect(formulaValueToText(true)).toBe("true");
    expect(formulaValueToText(false)).toBe("false");
    expect(formulaValueToText("x")).toBe("x");
  });

  it("coerces dates to their display string", () => {
    expect(formulaValueToText(MARCH_5)).toBe("2026-03-05");
    expect(formulaValueToText(MARCH_5_TIME)).toBe("2026-03-05 10:30");
  });

  it("refuses lists, rows, and lambdas with error values", () => {
    expect((formulaValueToText([1]) as FormulaError).message).toBe(
      "Cannot convert a list to text"
    );
    expect(
      (formulaValueToText(new FormulaRowRef("db", "row")) as FormulaError)
        .message
    ).toBe("Cannot convert a row to text");
    expect(
      (
        formulaValueToText(
          new FormulaLambda(["x"], LITERAL_ONE, null)
        ) as FormulaError
      ).message
    ).toBe(LAMBDA_AS_VALUE_MESSAGE);
  });

  it("passes errors through", () => {
    const error = formulaError("boom");
    expect(formulaValueToText(error)).toBe(error);
  });
});
