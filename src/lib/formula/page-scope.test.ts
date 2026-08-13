import { describe, expect, it } from "vitest";

import { checkFormula } from "@/lib/formula/check.ts";
import { evaluateFormula } from "@/lib/formula/evaluate.ts";
import {
  createPageFormulaScope,
  isBasePageField,
  type PageFormulaSource,
  pageFormulaCheckProperties,
} from "@/lib/formula/page-scope.ts";
import { parseFormula } from "@/lib/formula/parse.ts";
import { FormulaDate, isFormulaError } from "@/lib/formula/values.ts";

const PAGE: PageFormulaSource = {
  title: "Weekly notes",
  createdAt: "2026-01-05T09:30:00.000Z",
  updatedAt: "2026-08-11T12:00:00.000Z",
};

/** Evaluate `source` against the page scope. */
function run(source: string, page: PageFormulaSource = PAGE) {
  const parsed = parseFormula(source);
  if (!parsed.ok) {
    throw new Error(`Test setup: ${source} should parse`);
  }
  return evaluateFormula(parsed.ast, createPageFormulaScope(page));
}

describe("createPageFormulaScope", () => {
  it("reads the title by display name", () => {
    expect(run("thisPage.Title")).toBe("Weekly notes");
  });

  it("matches names case-insensitively, like every other scope", () => {
    expect(run("thisPage.title")).toBe("Weekly notes");
    expect(run('prop("Title")')).toBe("Weekly notes");
  });

  it("reads the canonical id form", () => {
    expect(run('prop("page:title")')).toBe("Weekly notes");
  });

  it("reads timestamps as real date values", () => {
    const created = run('prop("page:createdAt")');
    expect(created).toBeInstanceOf(FormulaDate);
    expect((created as FormulaDate).date.toISOString()).toBe(
      "2026-01-05T09:30:00.000Z"
    );
  });

  it("supports bracket access for the spaced names", () => {
    const value = run('thisPage["Updated at"]');
    expect(value).toBeInstanceOf(FormulaDate);
  });

  it("returns an error VALUE for an unknown property, never throwing", () => {
    const value = run("thisPage.Tags");
    expect(isFormulaError(value)).toBe(true);
  });

  it("reads blank rather than an invalid date for an unparseable timestamp", () => {
    expect(run('prop("page:createdAt")', { ...PAGE, createdAt: "junk" })).toBe(
      null
    );
  });

  it("composes with the rest of the language", () => {
    expect(run("upper(thisPage.Title)")).toBe("WEEKLY NOTES");
    expect(run('if(empty(thisPage.Title), "untitled", thisPage.Title)')).toBe(
      "Weekly notes"
    );
  });
});

describe("pageFormulaCheckProperties", () => {
  it("types thisPage.X so the editor can check and complete it", () => {
    const parsed = parseFormula("thisPage.Title");
    if (!parsed.ok) {
      throw new Error("Test setup: should parse");
    }
    const result = checkFormula(parsed.ast, {
      properties: pageFormulaCheckProperties(),
    });
    expect(result.diagnostics).toEqual([]);
  });

  it("diagnoses a property no page has", () => {
    const parsed = parseFormula("thisPage.Nonsense");
    if (!parsed.ok) {
      throw new Error("Test setup: should parse");
    }
    const result = checkFormula(parsed.ast, {
      properties: pageFormulaCheckProperties(),
    });
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("treats thisRow as an unknown name, not a page scope root", () => {
    const parsed = parseFormula("thisRow", { thisRowInScope: false });
    if (!parsed.ok) {
      throw new Error("Test setup: should parse");
    }
    const result = checkFormula(parsed.ast, {
      properties: pageFormulaCheckProperties(),
      thisRowInScope: false,
    });
    expect(result.diagnostics[0]?.message).toBe('Unknown name "thisRow"');
  });

  it("agrees with the scope about which names exist", () => {
    for (const property of pageFormulaCheckProperties()) {
      expect(isBasePageField(property.name)).toBe(true);
      expect(isBasePageField(property.id)).toBe(true);
    }
    expect(isBasePageField("Tags")).toBe(false);
  });

  it("uses ids that cannot collide with a database field id", () => {
    // Row/template pages layer database fields over these; a `page:` prefix
    // keeps the two id spaces disjoint (see page-formula-fields.ts).
    for (const property of pageFormulaCheckProperties()) {
      expect(property.id.startsWith("page:")).toBe(true);
    }
  });
});
