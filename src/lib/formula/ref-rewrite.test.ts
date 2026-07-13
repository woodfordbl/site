import { describe, expect, it } from "vitest";

import {
  canonicalDatabaseReference,
  canonicalizeExpression,
  canonicalPropertyReference,
  canonicalPropertyRewrites,
  type FormulaRefDatabase,
  humanizeExpression,
} from "@/lib/formula/ref-rewrite.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";

const FIELDS: DatabaseField[] = [
  { id: "f-price", name: "Price", type: "number" },
  { id: "f-unit", name: "Unit Count", type: "number" },
  { id: "f-quote", name: 'A "B" \\C', type: "text" },
];

/** FIELDS plus a duplicate normalized name (first in schema order wins). */
const CLASHING_FIELDS: DatabaseField[] = [
  ...FIELDS,
  { id: "f-dup1", name: "Score", type: "number" },
  { id: "f-dup2", name: "score", type: "text" },
];

describe("canonicalizeExpression", () => {
  it("rewrites dot references to prop() by field id", () => {
    expect(canonicalizeExpression("thisPage.Price * 2", FIELDS)).toEqual({
      text: 'prop("f-price") * 2',
      changed: true,
      unresolved: [],
    });
  });

  it("resolves names case-insensitively and via thisRow", () => {
    expect(canonicalizeExpression("thisrow.price", FIELDS).text).toBe(
      'prop("f-price")'
    );
    expect(canonicalizeExpression('THISPAGE["  price  "]', FIELDS).text).toBe(
      'prop("f-price")'
    );
  });

  it("rewrites bracket references", () => {
    expect(
      canonicalizeExpression('thisPage["Unit Count"] + 1', FIELDS).text
    ).toBe('prop("f-unit") + 1');
  });

  it("rewrites bracket names containing quotes and backslashes", () => {
    expect(
      canonicalizeExpression('thisPage["A \\"B\\" \\\\C"]', FIELDS).text
    ).toBe('prop("f-quote")');
  });

  it("leaves unresolvable names untouched and reports them", () => {
    expect(
      canonicalizeExpression("thisPage.Nope + thisPage.Price", FIELDS)
    ).toEqual({
      text: 'thisPage.Nope + prop("f-price")',
      changed: true,
      unresolved: ["Nope"],
    });
  });

  it("returns changed: false when every name is unresolvable", () => {
    expect(canonicalizeExpression("thisPage.Nope", FIELDS)).toEqual({
      text: "thisPage.Nope",
      changed: false,
      unresolved: ["Nope"],
    });
  });

  it("resolves duplicate normalized names to the first field in schema order", () => {
    expect(canonicalizeExpression("thisPage.SCORE", CLASHING_FIELDS).text).toBe(
      'prop("f-dup1")'
    );
  });

  it("leaves already-canonical references untouched", () => {
    expect(canonicalizeExpression('prop("f-price") + 1', FIELDS)).toEqual({
      text: 'prop("f-price") + 1',
      changed: false,
      unresolved: [],
    });
  });

  // v2: a pasted name-form prop() reference (argument is a field NAME, not
  // an id) canonicalizes too, instead of only resolving via the evaluator's
  // name fallback.
  it("rewrites prop() name references to the field id", () => {
    expect(canonicalizeExpression('prop("Price") + 1', FIELDS)).toEqual({
      text: 'prop("f-price") + 1',
      changed: true,
      unresolved: [],
    });
  });

  // v2: a prop() whose argument matches neither id nor name is a broken id
  // reference (visible in the UI), not an unresolved NAME — it stays as-is
  // and is not reported.
  it("keeps unknown prop() ids without reporting them as unresolved", () => {
    expect(canonicalizeExpression('prop("f-gone") + 1', FIELDS)).toEqual({
      text: 'prop("f-gone") + 1',
      changed: false,
      unresolved: [],
    });
  });

  it("handles mixed canonical and name input", () => {
    expect(
      canonicalizeExpression('prop("f-price") + thisPage["Unit Count"]', FIELDS)
        .text
    ).toBe('prop("f-price") + prop("f-unit")');
  });

  it("returns unparseable input unchanged", () => {
    expect(canonicalizeExpression("1 +", FIELDS)).toEqual({
      text: "1 +",
      changed: false,
      unresolved: [],
    });
    expect(canonicalizeExpression("", FIELDS).changed).toBe(false);
  });

  it("splices multiple references position-correctly", () => {
    expect(
      canonicalizeExpression(
        "thisPage.Price + thisPage.Price * thisPage.Price",
        FIELDS
      ).text
    ).toBe('prop("f-price") + prop("f-price") * prop("f-price")');
  });

  it("rewrites references nested inside calls without reformatting", () => {
    expect(
      canonicalizeExpression(
        "round( max(thisPage.Price,  thisPage.Price) , 2 )",
        FIELDS
      ).text
    ).toBe('round( max(prop("f-price"),  prop("f-price")) , 2 )');
  });
});

describe("humanizeExpression", () => {
  it("rewrites prop() to dot references for bare-identifier names", () => {
    expect(humanizeExpression('prop("f-price") * 2', FIELDS)).toBe(
      "thisPage.Price * 2"
    );
  });

  it("uses the bracket form for non-identifier names", () => {
    expect(humanizeExpression('prop("f-unit")', FIELDS)).toBe(
      'thisPage["Unit Count"]'
    );
  });

  it("escapes quotes and backslashes in bracket names", () => {
    expect(humanizeExpression('prop("f-quote")', FIELDS)).toBe(
      'thisPage["A \\"B\\" \\\\C"]'
    );
  });

  it("keeps unknown ids as visibly broken prop() references", () => {
    expect(humanizeExpression('prop("f-gone") + prop("f-price")', FIELDS)).toBe(
      'prop("f-gone") + thisPage.Price'
    );
  });

  it("leaves name references and unparseable input unchanged", () => {
    expect(humanizeExpression("thisPage.Price", FIELDS)).toBe("thisPage.Price");
    expect(humanizeExpression("1 +", FIELDS)).toBe("1 +");
  });
});

describe("round-trips", () => {
  it("humanize(canonicalize(t)) equals the humanize-normalized form", () => {
    const cases: [string, string][] = [
      ["thispage.price * 2", "thisPage.Price * 2"],
      [
        'thisRow["unit count"] + thisPage.PRICE',
        'thisPage["Unit Count"] + thisPage.Price',
      ],
      ['thisPage["A \\"B\\" \\\\C"]', 'thisPage["A \\"B\\" \\\\C"]'],
      [
        "if(thisPage.Price > 10, thisPage.Price, 0)",
        "if(thisPage.Price > 10, thisPage.Price, 0)",
      ],
    ];
    for (const [input, normalized] of cases) {
      const canonical = canonicalizeExpression(input, FIELDS).text;
      expect(humanizeExpression(canonical, FIELDS)).toBe(normalized);
      // Normalized display text re-canonicalizes to the same stored form.
      expect(canonicalizeExpression(normalized, FIELDS).text).toBe(canonical);
    }
  });

  it("canonicalize(humanize(c)) returns canonical text unchanged", () => {
    const canonical = 'prop("f-price") + prop("f-unit") * prop("f-quote")';
    expect(
      canonicalizeExpression(humanizeExpression(canonical, FIELDS), FIELDS).text
    ).toBe(canonical);
  });

  it("humanize∘canonicalize is display-stable, parseable or not", () => {
    // The panel's textarea shows humanize(draft) and re-canonicalizes on
    // every change; these are the invariants that keep the visible text from
    // jumping under the caret (unparseable text passes through BOTH
    // rewriters, and resolvable display references round-trip to
    // themselves).
    const displayStable = [
      "thisPage.Price * 2",
      'if(thisPage["Unit Count"] > 3, 1, 0)',
      "thisPage.Price +",
      'prop("f-price',
      "1 +",
      "",
    ];
    for (const text of displayStable) {
      expect(
        humanizeExpression(canonicalizeExpression(text, FIELDS).text, FIELDS)
      ).toBe(text);
    }
  });

  it("round-trips multi-line let statement sources, refs on both lines", () => {
    const display =
      "let t = thisPage.Price * 2; // tax\nround(t, 0) + thisPage.Price";
    const canonical = canonicalizeExpression(display, FIELDS).text;
    // Only the reference spans move; statements, `;`, newlines, and the
    // comment pass through untouched.
    expect(canonical).toBe(
      'let t = prop("f-price") * 2; // tax\nround(t, 0) + prop("f-price")'
    );
    expect(humanizeExpression(canonical, FIELDS)).toBe(display);
    expect(canonicalizeExpression(canonical, FIELDS)).toMatchObject({
      changed: false,
      text: canonical,
    });
  });
});

describe("canonicalPropertyRewrites", () => {
  it("returns the individual span rewrites in source order", () => {
    const text = 'thisPage.Price + thisPage["Unit Count"]';
    expect(canonicalPropertyRewrites(text, FIELDS)).toEqual([
      { start: 0, end: 14, text: 'prop("f-price")' },
      { start: 17, end: text.length, text: 'prop("f-unit")' },
    ]);
  });

  it("is empty for unparseable text, canonical text, and unresolved names", () => {
    expect(canonicalPropertyRewrites("1 +", FIELDS)).toEqual([]);
    expect(canonicalPropertyRewrites('prop("f-price")', FIELDS)).toEqual([]);
    expect(canonicalPropertyRewrites("thisPage.Ghost", FIELDS)).toEqual([]);
  });
});

describe("canonicalPropertyReference", () => {
  it("escapes quotes and backslashes in the id", () => {
    expect(canonicalPropertyReference("f-price")).toBe('prop("f-price")');
    expect(canonicalPropertyReference('a"b\\c')).toBe('prop("a\\"b\\\\c")');
  });
});

describe("db() reference rewriting", () => {
  const DATABASES: FormulaRefDatabase[] = [
    { id: "d-enroll", name: "Enrollments" },
    { id: "d-quote", name: 'A "B" \\C' },
    { id: "d-dup1", name: "Roster" },
    { id: "d-dup2", name: "roster" },
  ];

  it("canonicalizes db(name) to the database id", () => {
    expect(
      canonicalizeExpression('db("Enrollments").length()', FIELDS, DATABASES)
    ).toEqual({
      text: 'db("d-enroll").length()',
      changed: true,
      unresolved: [],
    });
  });

  it("resolves names case-insensitively, first database on collisions", () => {
    expect(
      canonicalizeExpression('db("enrollments")', FIELDS, DATABASES).text
    ).toBe('db("d-enroll")');
    expect(canonicalizeExpression('db("ROSTER")', FIELDS, DATABASES).text).toBe(
      'db("d-dup1")'
    );
  });

  it("keeps id references, unknown references, and db-less calls as-is", () => {
    expect(
      canonicalizeExpression('db("d-enroll") ', FIELDS, DATABASES).changed
    ).toBe(false);
    // Neither id nor name: a visibly broken reference, not an unresolved
    // name — the prop() rule.
    expect(canonicalizeExpression('db("Ghost")', FIELDS, DATABASES)).toEqual({
      text: 'db("Ghost")',
      changed: false,
      unresolved: [],
    });
    // Without a databases list, db references pass through untouched.
    expect(canonicalizeExpression('db("Enrollments")', FIELDS).changed).toBe(
      false
    );
  });

  it("canonicalizes escaped names and mixes with property rewrites", () => {
    expect(
      canonicalizeExpression(
        'thisPage.Price + db("A \\"B\\" \\\\C").length()',
        FIELDS,
        DATABASES
      ).text
    ).toBe('prop("f-price") + db("d-quote").length()');
  });

  it("humanizes db(id) to the database name, unknown ids staying canonical", () => {
    expect(
      humanizeExpression('db("d-enroll").length()', FIELDS, DATABASES)
    ).toBe('db("Enrollments").length()');
    expect(humanizeExpression('db("d-quote")', FIELDS, DATABASES)).toBe(
      'db("A \\"B\\" \\\\C")'
    );
    expect(humanizeExpression('db("d-gone")', FIELDS, DATABASES)).toBe(
      'db("d-gone")'
    );
    expect(humanizeExpression('db("d-enroll")', FIELDS)).toBe('db("d-enroll")');
  });

  it("round-trips: humanize∘canonicalize is display-stable", () => {
    const displayStable = [
      'db("Enrollments").filter(e => e.Status == "Active").length()',
      'thisPage.Price + db("Enrollments").length()',
      'db("A \\"B\\" \\\\C")',
      'db("Ghost")',
      'db("Enrollments',
      "1 +",
    ];
    for (const text of displayStable) {
      expect(
        humanizeExpression(
          canonicalizeExpression(text, FIELDS, DATABASES).text,
          FIELDS,
          DATABASES
        )
      ).toBe(text);
    }
  });

  it("canonicalize∘humanize returns canonical text unchanged", () => {
    const canonical = 'db("d-enroll").map(r => r.X).sum() + prop("f-price")';
    expect(
      canonicalizeExpression(
        humanizeExpression(canonical, FIELDS, DATABASES),
        FIELDS,
        DATABASES
      ).text
    ).toBe(canonical);
  });
});

describe("canonicalDatabaseReference", () => {
  it("escapes quotes and backslashes in the reference", () => {
    expect(canonicalDatabaseReference("d-enroll")).toBe('db("d-enroll")');
    expect(canonicalDatabaseReference('a"b\\c')).toBe('db("a\\"b\\\\c")');
  });
});
