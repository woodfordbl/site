/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RichTextContent } from "@/components/editor/rich-text.tsx";
import { formulaTokenMark } from "@/lib/blocks/inline-formula.ts";
import type { InlineFormulaPageModel } from "@/lib/databases/page-formula-fields.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";
import {
  type InlineMark,
  FORMULA_TOKEN_SENTINEL as S,
} from "@/lib/schemas/rich-text.ts";

/**
 * The read-only render of inline formula tokens: the sentinel never reaches the
 * screen, the value does, and the surrounding prose is untouched.
 *
 * The values are resolved here, not handed in — this is the only render path a
 * read-only surface has (a row page showing its database's template, a version
 * preview), so a token that does not resolve in this component never resolves
 * at all.
 */

const model = vi.hoisted(() => ({
  current: null as InlineFormulaPageModel | null,
}));

vi.mock("@/components/editor/inline-formula-page.tsx", () => ({
  useInlineFormulaPage: () => model.current,
}));

// The workspace collections are browser-only and say nothing about rendering;
// the formula evaluation itself runs for real.
vi.mock("@/db/queries/use-database.ts", () => ({ useAllDatabases: () => [] }));
vi.mock("@/db/queries/use-formula-functions.ts", () => ({
  useFormulaUserFunctions: () => [],
}));
vi.mock("@/lib/databases/formula-relations.ts", () => ({
  localFormulaRelationResolver: () => ({}),
}));

const SITE: DatabaseField = { id: "f-site", name: "Site", type: "text" };
const CREW: DatabaseField = { id: "f-crew", name: "Crew", type: "number" };

/** A row page's scope: the database's columns layered onto `thisPage`. */
function onRow(values: InlineFormulaPageModel["cellValues"]): void {
  model.current = {
    cellValues: values,
    databaseFields: [SITE, CREW],
    page: { createdAt: "", title: "Falcon 9", updatedAt: "" },
  };
}

afterEach(() => {
  model.current = null;
  cleanup();
});

describe("RichTextContent formula tokens", () => {
  const TEXT = `Launches from ${S} today.`;
  const MARKS: InlineMark[] = [formulaTokenMark(14, "thisPage.Site")];

  it("renders the row's value in the token's place", () => {
    onRow({ "f-site": "Cape Canaveral" });

    const { container } = render(<RichTextContent marks={MARKS} text={TEXT} />);

    expect(document.querySelector("[data-inline-formula]")?.textContent).toBe(
      "Cape Canaveral"
    );
    expect(container.textContent).toBe("Launches from Cape Canaveral today.");
  });

  it("never renders the sentinel itself", () => {
    onRow({ "f-site": "Cape Canaveral" });

    const { container } = render(<RichTextContent marks={MARKS} text={TEXT} />);

    expect(container.textContent).not.toContain(S);
  });

  it("shows a placeholder, not a sentinel, outside any page", () => {
    const { container } = render(<RichTextContent marks={MARKS} text={TEXT} />);

    expect(container.textContent).not.toContain(S);
    expect(document.querySelector("[data-inline-formula]")?.textContent).toBe(
      "…"
    );
  });

  it("exposes the full value and its expression on hover", () => {
    // The rendered value can be truncated, so the tooltip carries it whole
    // above the expression that produced it.
    onRow({ "f-site": "Cape Canaveral" });

    render(<RichTextContent marks={MARKS} text={TEXT} />);

    expect(
      document.querySelector("[data-inline-formula]")?.getAttribute("title")
    ).toBe("Cape Canaveral\nthisPage.Site");
  });

  it("falls back to the expression alone before a value resolves", () => {
    render(<RichTextContent marks={MARKS} text={TEXT} />);

    expect(
      document.querySelector("[data-inline-formula]")?.getAttribute("title")
    ).toBe("thisPage.Site");
  });

  it("keys values by offset, so several tokens stay distinct", () => {
    onRow({ "f-site": "Cape Canaveral", "f-crew": 4 });
    const text = `${S} of ${S}`;
    const marks = [
      formulaTokenMark(0, "thisPage.Crew"),
      formulaTokenMark(5, "thisPage.Site"),
    ];

    const { container } = render(<RichTextContent marks={marks} text={text} />);

    expect(container.textContent).toBe("4 of Cape Canaveral");
  });

  it("leaves ordinary marked text alone", () => {
    const { container } = render(
      <RichTextContent
        marks={[{ type: "bold", start: 0, end: 4 }]}
        text="bold text"
      />
    );

    expect(container.textContent).toBe("bold text");
    expect(document.querySelector("[data-inline-formula]")).toBeNull();
  });
});
