/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";

import { formulaTokenMark } from "@/lib/blocks/inline-formula.ts";
import {
  applyInlineFormulaValues,
  createInlineFormulaToken,
  PENDING_FORMULA_VALUE,
  repairInlineFormulaTokenDom,
  resolveRichTextPosition,
  richTextToHtml,
  serializeRichTextDom,
} from "@/lib/editor/rich-text-dom.ts";
import { EMPTY_INLINE_FORMULA_LABEL } from "@/lib/formula/display.ts";
import type { InlineMark } from "@/lib/schemas/rich-text.ts";
import { FORMULA_TOKEN_SENTINEL as S } from "@/lib/schemas/rich-text.ts";

/**
 * The editable half of inline formula tokens. The invariant under test
 * throughout: the token element stands in for exactly one sentinel character,
 * and NOTHING inside it reaches the model — so the value can be rewritten
 * freely while `(text, marks)` round-trips byte for byte.
 */

const EXPRESSION = 'count(db("Tasks"))';
const TEXT = `We have ${S} open tasks.`;
const MARKS: InlineMark[] = [formulaTokenMark(8, EXPRESSION)];

function mountField(text: string, marks: InlineMark[]): HTMLDivElement {
  const root = document.createElement("div");
  root.contentEditable = "true";
  root.innerHTML = richTextToHtml(text, marks, () => "marked");
  document.body.append(root);
  return root;
}

function tokenIn(root: HTMLElement): HTMLElement {
  const token = root.querySelector<HTMLElement>("[data-formula-token]");
  if (!token) {
    throw new Error("no token in field");
  }
  return token;
}

describe("token DOM shape", () => {
  it("renders a token element instead of the sentinel character", () => {
    const root = mountField(TEXT, MARKS);
    expect(root.textContent).not.toContain(S);
    expect(tokenIn(root).dataset.expression).toBe(EXPRESSION);
  });

  it("is atomic — the caret cannot be placed inside it", () => {
    const root = mountField(TEXT, MARKS);
    expect(tokenIn(root).getAttribute("contenteditable")).toBe("false");
  });

  it("shows the pending placeholder until a value arrives", () => {
    const root = mountField(TEXT, MARKS);
    expect(tokenIn(root).textContent).toBe(PENDING_FORMULA_VALUE);
  });

  it("escapes an expression that would otherwise break out of the attribute", () => {
    const nasty = 'concat("<img src=x>", "&")';
    const root = mountField(S, [formulaTokenMark(0, nasty)]);
    expect(tokenIn(root).dataset.expression).toBe(nasty);
    expect(root.querySelector("img")).toBeNull();
  });

  it("agrees with the imperative builder", () => {
    const built = createInlineFormulaToken(document, {
      className: "marked",
      expression: EXPRESSION,
    });
    const parsed = tokenIn(mountField(TEXT, MARKS));
    expect(built.outerHTML).toBe(parsed.outerHTML);
  });
});

describe("serialization", () => {
  it("round-trips text and marks through the DOM", () => {
    const snapshot = serializeRichTextDom(mountField(TEXT, MARKS));
    expect(snapshot.text).toBe(TEXT);
    expect(snapshot.marks).toEqual(MARKS);
  });

  it("keeps two adjacent tokens distinct, even with one expression", () => {
    const text = `${S}${S}`;
    const marks = [formulaTokenMark(0, "a"), formulaTokenMark(1, "a")];
    const snapshot = serializeRichTextDom(mountField(text, marks));
    expect(snapshot.text).toBe(text);
    expect(snapshot.marks).toHaveLength(2);
  });

  it("never leaks the displayed value into the model", () => {
    const root = mountField(TEXT, MARKS);
    applyInlineFormulaValues(root, new Map([[8, "1,204"]]));
    const snapshot = serializeRichTextDom(root);
    expect(snapshot.text).toBe(TEXT);
    expect(snapshot.text).not.toContain("1,204");
  });

  it("survives a mark that is present but has no expression", () => {
    const root = mountField(TEXT, MARKS);
    tokenIn(root).removeAttribute("data-expression");
    expect(serializeRichTextDom(root).marks[0]?.expression).toBe("");
  });
});

describe("applyInlineFormulaValues", () => {
  it("writes the value into the token, keyed by model offset", () => {
    const root = mountField(TEXT, MARKS);
    applyInlineFormulaValues(root, new Map([[8, "12"]]));
    expect(root.textContent).toBe("We have 12 open tasks.");
  });

  it("targets each token by its own offset", () => {
    const root = mountField(`${S} of ${S}`, [
      formulaTokenMark(0, "a"),
      formulaTokenMark(5, "b"),
    ]);
    applyInlineFormulaValues(
      root,
      new Map([
        [0, "3"],
        [5, "9"],
      ])
    );
    expect(root.textContent).toBe("3 of 9");
  });

  it("falls back to the placeholder for an offset it has no value for", () => {
    const root = mountField(TEXT, MARKS);
    applyInlineFormulaValues(root, new Map([[8, "12"]]));
    applyInlineFormulaValues(root, new Map());
    expect(tokenIn(root).textContent).toBe(PENDING_FORMULA_VALUE);
  });

  it("marks blank None values with data-formula-empty for the muted chip", () => {
    const root = mountField(TEXT, MARKS);
    applyInlineFormulaValues(root, new Map([[8, EMPTY_INLINE_FORMULA_LABEL]]));
    expect(tokenIn(root).hasAttribute("data-formula-empty")).toBe(true);
    applyInlineFormulaValues(root, new Map([[8, "This, Other"]]));
    expect(tokenIn(root).hasAttribute("data-formula-empty")).toBe(false);
  });

  it("leaves the field's own text nodes untouched", () => {
    const root = mountField(TEXT, MARKS);
    const before = root.firstChild;
    applyInlineFormulaValues(root, new Map([[8, "12"]]));
    // Node identity matters: a replaced text node would drop a live selection.
    expect(root.firstChild).toBe(before);
  });
});

describe("caret offsets", () => {
  it("places an offset before the token outside it", () => {
    const root = mountField(TEXT, MARKS);
    const position = resolveRichTextPosition(root, 8);
    expect(tokenIn(root).contains(position.node)).toBe(false);
  });

  it("resolves the end of a field that ends in a token to after it", () => {
    const root = mountField(`Total: ${S}`, [formulaTokenMark(7, EXPRESSION)]);
    const position = resolveRichTextPosition(root, 8);
    expect(position.node).toBe(root);
    expect(position.offset).toBe(root.childNodes.length);
  });

  it("counts the token as one character for following text", () => {
    const root = mountField(TEXT, MARKS);
    const position = resolveRichTextPosition(root, 11);
    expect(position.node.textContent).toBe(" open tasks.");
    expect(position.offset).toBe(2);
  });
});

describe("repairInlineFormulaTokenDom", () => {
  it("lifts text the browser stranded inside the token back out", () => {
    const root = mountField(TEXT, MARKS);
    const token = tokenIn(root);
    token.append(document.createTextNode("typed"));

    expect(repairInlineFormulaTokenDom(root)).toBe(true);
    // Without the lift this text would be silently dropped, not mis-marked.
    const snapshot = serializeRichTextDom(root);
    expect(snapshot.text).toBe(`We have ${S}typed open tasks.`);
  });

  it("puts text that landed ahead of the value before the token", () => {
    const root = mountField(TEXT, MARKS);
    const token = tokenIn(root);
    token.insertBefore(document.createTextNode("x"), token.firstChild);

    repairInlineFormulaTokenDom(root);
    expect(serializeRichTextDom(root).text).toBe(`We have x${S} open tasks.`);
  });

  it("reports no change when the token is intact", () => {
    const root = mountField(TEXT, MARKS);
    expect(repairInlineFormulaTokenDom(root)).toBe(false);
  });
});
