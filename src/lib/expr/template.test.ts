import { describe, expect, it } from "vitest";

import { type ExprScope, exprError } from "@/lib/expr/evaluate.ts";
import {
  evaluateTemplateText,
  splitTemplateText,
} from "@/lib/expr/template.ts";

const scope: ExprScope = {
  getProperty: (name) => {
    if (name === "Name") {
      return "Ada";
    }
    if (name === "Score") {
      return 1234.5;
    }
    return exprError(`Unknown property "${name}"`);
  },
};

describe("splitTemplateText", () => {
  it("returns no segments for the empty string", () => {
    expect(splitTemplateText("")).toEqual([]);
  });

  it("returns one text segment when there are no tokens", () => {
    expect(splitTemplateText("plain prose")).toEqual([
      { kind: "text", text: "plain prose" },
    ]);
  });

  it("splits a token out of surrounding text", () => {
    expect(splitTemplateText("Hello {{ thisPage.Name }}!")).toEqual([
      { kind: "text", text: "Hello " },
      { kind: "expr", source: "thisPage.Name" },
      { kind: "text", text: "!" },
    ]);
  });

  it("handles multiple tokens on one line", () => {
    expect(
      splitTemplateText("{{ thisPage.Name }} scored {{ thisPage.Score }} pts")
    ).toEqual([
      { kind: "expr", source: "thisPage.Name" },
      { kind: "text", text: " scored " },
      { kind: "expr", source: "thisPage.Score" },
      { kind: "text", text: " pts" },
    ]);
  });

  it("handles adjacent tokens with no text between", () => {
    expect(splitTemplateText("{{1}}{{2}}")).toEqual([
      { kind: "expr", source: "1" },
      { kind: "expr", source: "2" },
    ]);
  });

  it("handles tokens at the very start and end", () => {
    expect(splitTemplateText("{{ 1 }} mid {{ 2 }}")).toEqual([
      { kind: "expr", source: "1" },
      { kind: "text", text: " mid " },
      { kind: "expr", source: "2" },
    ]);
  });

  it("treats an unterminated {{ as literal text", () => {
    expect(splitTemplateText("Hi {{ oops")).toEqual([
      { kind: "text", text: "Hi {{ oops" },
    ]);
  });

  it("treats an unterminated token after a complete one as text", () => {
    expect(splitTemplateText("{{ 1 }} then {{ nope")).toEqual([
      { kind: "expr", source: "1" },
      { kind: "text", text: " then {{ nope" },
    ]);
  });

  it("keeps stray braces as plain text", () => {
    expect(splitTemplateText("a } b { c }} d")).toEqual([
      { kind: "text", text: "a } b { c }} d" },
    ]);
  });

  it("captures an empty token as an empty source", () => {
    expect(splitTemplateText("{{}}")).toEqual([{ kind: "expr", source: "" }]);
  });

  it("closes at the first }} it finds", () => {
    expect(splitTemplateText("{{ 1 }} }}")).toEqual([
      { kind: "expr", source: "1" },
      { kind: "text", text: " }}" },
    ]);
  });
});

describe("evaluateTemplateText", () => {
  it("renders mixed text and expressions", () => {
    expect(evaluateTemplateText("Hello {{ thisPage.Name }}!", scope)).toBe(
      "Hello Ada!"
    );
  });

  it("display-formats evaluated values", () => {
    expect(evaluateTemplateText("Score: {{ thisPage.Score }}", scope)).toBe(
      "Score: 1,234.5"
    );
    expect(evaluateTemplateText("{{ 1 < 2 }}", scope)).toBe("Yes");
    expect(evaluateTemplateText("[{{ null }}]", scope)).toBe("[]");
  });

  it("renders adjacent tokens", () => {
    expect(
      evaluateTemplateText("{{ thisPage.Name }}{{ thisPage.Score }}", scope)
    ).toBe("Ada1,234.5");
  });

  it("renders evaluation errors inline with the warning prefix", () => {
    expect(evaluateTemplateText("{{ thisPage.Nope }}", scope)).toBe(
      '⚠ Unknown property "Nope"'
    );
  });

  it("renders parse errors inline instead of throwing", () => {
    expect(evaluateTemplateText("{{ 1 + }}", scope)).toBe(
      "⚠ Unexpected end of expression"
    );
    expect(evaluateTemplateText("{{}}", scope)).toBe("⚠ Empty expression");
  });

  it("passes token-free text through untouched", () => {
    expect(evaluateTemplateText("no tokens here", scope)).toBe(
      "no tokens here"
    );
  });

  it("supports expressions with functions and operators", () => {
    expect(
      evaluateTemplateText(
        'Total: {{ format(round(thisPage.Score * 2, 0)) }} ({{ upper("ok") }})',
        scope
      )
    ).toBe("Total: 2,469 (OK)");
  });
});

describe("string-literal-aware delimiter matching", () => {
  it("does not close an expression at a }} inside a quoted literal", () => {
    expect(
      splitTemplateText('{{ replace(thisPage.Name, "}}", "-") }} after')
    ).toEqual([
      { kind: "expr", source: 'replace(thisPage.Name, "}}", "-")' },
      { kind: "text", text: " after" },
    ]);
  });

  it("respects single quotes and backslash escapes", () => {
    expect(splitTemplateText("{{ '}}' }}")).toEqual([
      { kind: "expr", source: "'}}'" },
    ]);
    expect(splitTemplateText('{{ "\\"}}" }}')).toEqual([
      { kind: "expr", source: '"\\"}}"' },
    ]);
  });

  it("evaluates expressions whose literals contain }}", () => {
    expect(
      evaluateTemplateText('{{ replace("a}}b", "}}", "-") }}', scope)
    ).toBe("a-b");
  });

  it("treats a token whose only }} sits inside an unterminated quote as text", () => {
    expect(splitTemplateText('{{ "oops }}')).toEqual([
      { kind: "text", text: '{{ "oops }}' },
    ]);
  });

  it("never throws on pathologically nested template expressions", () => {
    const payload = `{{ ${"(".repeat(3000)}1${")".repeat(3000)} }}`;
    expect(evaluateTemplateText(payload, scope)).toContain("⚠");
  });
});
