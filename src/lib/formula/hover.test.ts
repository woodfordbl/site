import { describe, expect, it } from "vitest";

import {
  checkFormula,
  type FormulaCheckContext,
  type FormulaCheckProperty,
} from "@/lib/formula/check.ts";
import { formulaHoverAt } from "@/lib/formula/hover.ts";
import { parseFormula } from "@/lib/formula/parse.ts";
import { NUMBER_TYPE, UNKNOWN_TYPE } from "@/lib/formula/types.ts";
import type { FormulaScope } from "@/lib/formula/values.ts";

const SCHEMA: FormulaCheckProperty[] = [
  { id: "f_est", kind: "number", name: "Estimate", type: UNKNOWN_TYPE },
  { id: "f_rate", kind: "number", name: "Rate", type: UNKNOWN_TYPE },
  { id: "f_title", kind: "text", name: "Title", type: UNKNOWN_TYPE },
];

const CONTEXT: FormulaCheckContext = { properties: SCHEMA };

/** Estimate 5, Rate 40, Title "Design". */
const SCOPE: FormulaScope = {
  getProperty: (ref) => {
    if (ref === "f_est") {
      return 5;
    }
    if (ref === "f_rate") {
      return 40;
    }
    return ref === "f_title" ? "Design" : null;
  },
};

/** Offset of `needle`'s first character in `source`. */
function at(source: string, needle: string): number {
  const index = source.indexOf(needle);
  if (index < 0) {
    throw new Error(`Test setup: "${needle}" not found in "${source}"`);
  }
  return index;
}

describe("formulaHoverAt", () => {
  it("reports the type of the innermost node under the cursor", () => {
    const source = 'prop("f_est") * prop("f_rate")';
    const inner = formulaHoverAt(source, at(source, 'prop("f_est")'), {
      context: CONTEXT,
    });
    // Labels read like the editor looks, not like the canonical storage form.
    expect(inner?.label).toBe("Estimate");
    expect(inner?.type).toBe("number");
  });

  it("reports the whole expression when hovering the operator", () => {
    const source = 'prop("f_est") * prop("f_rate")';
    const hover = formulaHoverAt(source, at(source, "*"), { context: CONTEXT });
    expect(hover?.start).toBe(0);
    expect(hover?.end).toBe(source.length);
    expect(hover?.type).toBe("number");
    expect(hover?.label).toBe("Estimate * Rate");
  });

  it("evaluates the hovered subexpression against the scope", () => {
    const source = 'prop("f_est") * prop("f_rate")';
    const whole = formulaHoverAt(source, at(source, "*"), {
      context: CONTEXT,
      scope: SCOPE,
    });
    expect(whole?.value).toBe("200");

    const operand = formulaHoverAt(source, at(source, 'prop("f_rate")'), {
      context: CONTEXT,
      scope: SCOPE,
    });
    expect(operand?.value).toBe("40");
  });

  it("omits values when no scope is supplied", () => {
    const source = 'prop("f_est") + 1';
    const hover = formulaHoverAt(source, at(source, "+"), { context: CONTEXT });
    expect(hover?.type).toBe("number");
    expect(hover?.value).toBeNull();
  });

  it("labels a call with its signature and description", () => {
    const source = 'round(prop("f_est") / 3, 2)';
    const hover = formulaHoverAt(source, at(source, "round"), {
      context: CONTEXT,
      scope: SCOPE,
    });
    expect(hover?.label).toContain("round(");
    expect(hover?.description).toBeTruthy();
    expect(hover?.value).toBe("1.67");
  });

  it("skips evaluation inside a lambda, whose params bind only mid-call", () => {
    const source = "map([1, 2, 3], x => x * 2)";
    const body = formulaHoverAt(source, at(source, "x * 2"), {
      context: CONTEXT,
      scope: SCOPE,
    });
    // Type still reports; a standalone evaluation would spuriously fail on `x`.
    expect(body?.value).toBeNull();
    // The enclosing call is evaluable and unaffected.
    const call = formulaHoverAt(source, at(source, "map"), {
      context: CONTEXT,
      scope: SCOPE,
    });
    expect(call?.value).toBe("2, 4, 6");
  });

  it("skips evaluation of a `let` binding reference, bound by its statement", () => {
    const source =
      'let amount = prop("f_est") * prop("f_rate");\nround(amount, 2)';
    // The bare `amount` on the final line has no binding standalone.
    const reference = formulaHoverAt(source, at(source, "round(amount") + 6, {
      context: CONTEXT,
      scope: SCOPE,
    });
    expect(reference?.kind).toBe("variable");
    expect(reference?.value).toBeNull();

    // The inner call is still under the binder, so it stays unevaluated...
    const inner = formulaHoverAt(source, at(source, "round"), {
      context: CONTEXT,
      scope: SCOPE,
    });
    expect(inner?.value).toBeNull();

    // ...but the whole `let` introduces the binding itself, so it evaluates.
    const whole = formulaHoverAt(source, at(source, "let"), {
      context: CONTEXT,
      scope: SCOPE,
    });
    expect(whole?.value).toBe("200");
  });

  it("classifies the node for the head line's (kind) prefix", () => {
    const property = 'prop("f_est")';
    expect(formulaHoverAt(property, 2, { context: CONTEXT })?.kind).toBe(
      "property"
    );

    const call = 'round(prop("f_est"), 1)';
    expect(formulaHoverAt(call, 0, { context: CONTEXT })?.kind).toBe(
      "function"
    );

    const binding = "let tax = 0.1;\ntax";
    expect(
      formulaHoverAt(binding, at(binding, "\ntax") + 1, { context: CONTEXT })
        ?.kind
    ).toBe("variable");

    const expression = 'prop("f_est") * 2';
    expect(
      formulaHoverAt(expression, at(expression, "*"), { context: CONTEXT })
        ?.kind
    ).toBe("expression");
  });

  it("reads a `//` doc comment written above the hovered line", () => {
    const source = [
      "// Tax rate applied to every line.",
      "let tax = 0.1;",
      "tax",
    ].join("\n");
    const hover = formulaHoverAt(source, at(source, "let"), {
      context: CONTEXT,
    });
    expect(hover?.description).toBe("Tax rate applied to every line.");
  });

  it("joins a multi-line `//` run and stops at a blank line", () => {
    const source = [
      "// Ignored, separated by a blank line.",
      "",
      "// First line.",
      "// Second line.",
      "let tax = 0.1;",
      "tax",
    ].join("\n");
    const hover = formulaHoverAt(source, at(source, "let"), {
      context: CONTEXT,
    });
    expect(hover?.description).toBe("First line. Second line.");
  });

  it("reads a block doc comment, stripping jsdoc-style leading stars", () => {
    const source = ["/**", " * Budget share.", " */", 'prop("f_est")'].join(
      "\n"
    );
    const hover = formulaHoverAt(source, at(source, 'prop("f_est")'), {
      context: CONTEXT,
    });
    expect(hover?.description).toBe("Budget share.");
  });

  it("prefers a catalog description over a doc comment", () => {
    const source = ["// My own note.", 'round(prop("f_est"), 1)'].join("\n");
    const hover = formulaHoverAt(source, at(source, "round"), {
      context: CONTEXT,
    });
    expect(hover?.description).not.toBe("My own note.");
    expect(hover?.description).toBeTruthy();
  });

  it("returns null for unparseable input and for an offset past the end", () => {
    expect(formulaHoverAt("1 +", 0, { context: CONTEXT })).toBeNull();
    expect(formulaHoverAt("1 + 2", 99, { context: CONTEXT })).toBeNull();
  });

  it("reports text type for a text property", () => {
    const source = 'prop("f_title")';
    const hover = formulaHoverAt(source, 2, { context: CONTEXT, scope: SCOPE });
    expect(hover?.type).toBe("text");
    expect(hover?.value).toBe("Design");
  });

  it("surfaces an evaluation error as the value rather than throwing", () => {
    // Member access on text (not a relation row) is an error-as-value.
    const source = 'prop("f_title").Owner';
    const hover = formulaHoverAt(source, at(source, "Owner"), {
      context: CONTEXT,
      scope: SCOPE,
    });
    expect(hover?.value).toContain("⚠");
  });

  it("concatenates rather than erroring on text + number (v2 `+` overload)", () => {
    const source = 'prop("f_title") + 1';
    const hover = formulaHoverAt(source, at(source, "+"), {
      context: CONTEXT,
      scope: SCOPE,
    });
    expect(hover?.value).toBe("Design1");
  });
});

describe("checkFormula type trace", () => {
  it("stays empty unless the context opts in", () => {
    const parsed = parseFormula('prop("f_est") + 1');
    if (!parsed.ok) {
      throw new Error("Test setup: expression should parse");
    }
    expect(checkFormula(parsed.ast, CONTEXT).types).toHaveLength(0);

    const traced = checkFormula(parsed.ast, { ...CONTEXT, traceTypes: true });
    expect(traced.types.length).toBeGreaterThan(0);
    // The property node keeps its own type over its own span.
    const property = traced.types.find(
      (span) => span.start === 0 && span.end === 'prop("f_est")'.length
    );
    expect(property?.type).toEqual(NUMBER_TYPE);
    // ...and the whole binary expression keeps its own.
    const whole = traced.types.find(
      (span) => span.start === 0 && span.end === 'prop("f_est") + 1'.length
    );
    expect(whole?.type).toEqual(NUMBER_TYPE);
  });
});
