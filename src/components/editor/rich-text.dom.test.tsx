/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RichTextContent } from "@/components/editor/rich-text.tsx";
import { formulaTokenMark } from "@/lib/blocks/inline-formula.ts";
import {
  type InlineMark,
  FORMULA_TOKEN_SENTINEL as S,
} from "@/lib/schemas/rich-text.ts";

/**
 * The read-only render of inline formula tokens: the sentinel never reaches the
 * screen, the value does, and the surrounding prose is untouched.
 */

afterEach(cleanup);

describe("RichTextContent formula tokens", () => {
  const TEXT = `We have ${S} open tasks.`;
  const MARKS: InlineMark[] = [formulaTokenMark(8, 'count(db("t"))')];

  it("renders the value in the token's place", () => {
    render(
      <RichTextContent
        formulaValues={new Map([[8, "12"]])}
        marks={MARKS}
        text={TEXT}
      />
    );
    const token = document.querySelector("[data-inline-formula]");
    expect(token?.textContent).toBe("12");
  });

  it("never renders the sentinel itself", () => {
    const { container } = render(
      <RichTextContent
        formulaValues={new Map([[8, "12"]])}
        marks={MARKS}
        text={TEXT}
      />
    );
    expect(container.textContent).not.toContain(S);
    expect(container.textContent).toBe("We have 12 open tasks.");
  });

  it("shows a placeholder, not a sentinel, before the value resolves", () => {
    const { container } = render(<RichTextContent marks={MARKS} text={TEXT} />);
    expect(container.textContent).not.toContain(S);
    expect(document.querySelector("[data-inline-formula]")?.textContent).toBe(
      "…"
    );
  });

  it("exposes the full value and its expression on hover", () => {
    // The rendered value can be truncated, so the tooltip carries it whole
    // above the expression that produced it.
    render(
      <RichTextContent
        formulaValues={new Map([[8, "12"]])}
        marks={MARKS}
        text={TEXT}
      />
    );
    expect(
      document.querySelector("[data-inline-formula]")?.getAttribute("title")
    ).toBe('12\ncount(db("t"))');
  });

  it("falls back to the expression alone before a value resolves", () => {
    render(<RichTextContent marks={MARKS} text={TEXT} />);
    expect(
      document.querySelector("[data-inline-formula]")?.getAttribute("title")
    ).toBe('count(db("t"))');
  });

  it("keys values by offset, so several tokens stay distinct", () => {
    const text = `${S} of ${S}`;
    const marks = [formulaTokenMark(0, "a"), formulaTokenMark(5, "b")];
    const { container } = render(
      <RichTextContent
        formulaValues={
          new Map([
            [0, "3"],
            [5, "9"],
          ])
        }
        marks={marks}
        text={text}
      />
    );
    expect(container.textContent).toBe("3 of 9");
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
