import { describe, expect, it } from "vitest";

import {
  createInlinePageFormulaScope,
  inlinePageFormulaCheckProperties,
  pageFormulaFields,
  pageFormulaPreviewRow,
  pageHasFormulaRowContext,
} from "@/lib/databases/page-formula-fields.ts";
import { checkFormula } from "@/lib/formula/check.ts";
import { evaluateFormula } from "@/lib/formula/evaluate.ts";
import type { PageFormulaSource } from "@/lib/formula/page-scope.ts";
import { parseFormula } from "@/lib/formula/parse.ts";
import { FormulaDate, isFormulaError } from "@/lib/formula/values.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";

const PAGE: PageFormulaSource = {
  title: "Weekly notes",
  createdAt: "2026-01-05T09:30:00.000Z",
  updatedAt: "2026-08-11T12:00:00.000Z",
};

const TAGS: DatabaseField = {
  id: "f-tags",
  name: "Tags",
  type: "multiSelect",
  options: [
    { id: "o-a", name: "Alpha", color: "blue" },
    { id: "o-b", name: "Beta", color: "green" },
  ],
};

const DONE: DatabaseField = {
  id: "f-done",
  name: "Done",
  type: "checkbox",
};

const SHADOW_TITLE: DatabaseField = {
  id: "f-title",
  name: "Title",
  type: "text",
};

/** Evaluate `source` against the layered inline page scope. */
function run(
  source: string,
  overlay?: {
    fields: readonly DatabaseField[];
    values: Record<string, string | number | boolean | string[] | null>;
  }
) {
  const parsed = parseFormula(source);
  if (!parsed.ok) {
    throw new Error(`Test setup: ${source} should parse`);
  }
  return evaluateFormula(
    parsed.ast,
    createInlinePageFormulaScope(
      PAGE,
      overlay === undefined
        ? null
        : {
            fields: overlay.fields,
            values: overlay.values,
          }
    )
  );
}

describe("pageFormulaFields", () => {
  it("returns only base page fields without an overlay", () => {
    expect(pageFormulaFields().map((field) => field.name)).toEqual([
      "Title",
      "Created at",
      "Updated at",
    ]);
  });

  it("lists database fields first and drops shadowed base names", () => {
    const fields = pageFormulaFields([SHADOW_TITLE, TAGS]);
    expect(fields.map((field) => field.id)).toEqual([
      "f-title",
      "f-tags",
      "page:createdAt",
      "page:updatedAt",
    ]);
  });
});

describe("pageHasFormulaRowContext", () => {
  it("is false on ordinary pages and true when database fields are layered", () => {
    expect(pageHasFormulaRowContext({ databaseFields: [] })).toBe(false);
    expect(pageHasFormulaRowContext({ databaseFields: [TAGS] })).toBe(true);
    expect(pageHasFormulaRowContext(null)).toBe(false);
  });
});

describe("inlinePageFormulaCheckProperties", () => {
  it("types database properties for thisPage.X", () => {
    const parsed = parseFormula("thisPage.Tags");
    if (!parsed.ok) {
      throw new Error("Test setup: should parse");
    }
    const result = checkFormula(parsed.ast, {
      properties: inlinePageFormulaCheckProperties([TAGS, DONE]),
    });
    expect(result.diagnostics).toEqual([]);
  });

  it("keeps base ids reachable when a column shadows the display name", () => {
    const parsed = parseFormula('prop("page:title")');
    if (!parsed.ok) {
      throw new Error("Test setup: should parse");
    }
    const result = checkFormula(parsed.ast, {
      properties: inlinePageFormulaCheckProperties([SHADOW_TITLE]),
    });
    expect(result.diagnostics).toEqual([]);
  });
});

describe("createInlinePageFormulaScope", () => {
  it("reads base fields when there is no overlay", () => {
    expect(run("thisPage.Title")).toBe("Weekly notes");
  });

  it("reads database cell values on the overlay", () => {
    expect(
      run("thisPage.Done", {
        fields: [DONE, TAGS],
        values: { "f-done": true, "f-tags": ["o-a"] },
      })
    ).toBe(true);
  });

  it("lets a database field shadow a base display name", () => {
    expect(
      run("thisPage.Title", {
        fields: [SHADOW_TITLE],
        values: { "f-title": "Row title" },
      })
    ).toBe("Row title");
  });

  it("still reads the base field by canonical id under a shadow", () => {
    expect(
      run('prop("page:title")', {
        fields: [SHADOW_TITLE],
        values: { "f-title": "Row title" },
      })
    ).toBe("Weekly notes");
  });

  it("returns an error value for an unknown property", () => {
    const value = run("thisPage.Missing", {
      fields: [DONE],
      values: { "f-done": false },
    });
    expect(isFormulaError(value)).toBe(true);
  });

  it("keeps base timestamps as dates alongside the overlay", () => {
    const created = run('prop("page:createdAt")', {
      fields: [DONE],
      values: { "f-done": false },
    });
    expect(created).toBeInstanceOf(FormulaDate);
  });
});

describe("pageFormulaPreviewRow", () => {
  it("merges cell values onto the synthetic page row", () => {
    const row = pageFormulaPreviewRow(PAGE, { "f-done": true });
    expect(row.values["page:title"]).toBe("Weekly notes");
    expect(row.values["f-done"]).toBe(true);
  });
});
