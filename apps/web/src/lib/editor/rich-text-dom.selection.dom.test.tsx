/** @vitest-environment jsdom */
/**
 * @fileoverview Guards the DOM ↔ model offset mapping, which every formatting
 * action reads through: a selection that maps back one character off applies
 * bold (or a link, or a split) to the wrong run. The mapping is only exercised
 * end to end here — the round-trip is the invariant, not any single helper.
 */
import { describe, expect, it } from "vitest";

import {
  getRichTextSelection,
  richTextToHtml,
  serializeRichTextDom,
  setRichTextSelection,
} from "@/lib/editor/rich-text-dom.ts";
import type { InlineMark } from "@/lib/schemas/rich-text.ts";
import { FORMULA_TOKEN_SENTINEL } from "@/lib/schemas/rich-text.ts";

function mountField(text: string, marks: InlineMark[]): HTMLDivElement {
  const root = document.createElement("div");
  root.contentEditable = "true";
  root.innerHTML = richTextToHtml(text, marks, () => "marked", {
    classForPageLink: () => "page-link",
  });
  document.body.append(root);
  return root;
}

function selectDom(
  startNode: Node,
  startOffset: number,
  endNode: Node,
  endOffset: number
): void {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

const FIELDS: Array<{ marks: InlineMark[]; name: string; text: string }> = [
  { name: "plain text", text: "hello world", marks: [] },
  {
    name: "a leading marked run",
    text: "hello world",
    marks: [{ type: "bold", start: 0, end: 5 }],
  },
  {
    name: "a marked run mid-text",
    text: "hello world",
    marks: [{ type: "bold", start: 3, end: 8 }],
  },
  {
    name: "two marked runs",
    text: "abcdefghij",
    marks: [
      { type: "bold", start: 1, end: 3 },
      { type: "italic", start: 6, end: 9 },
    ],
  },
  { name: "newlines", text: "one\ntwo\nthree", marks: [] },
  {
    name: "an inline page link",
    text: "see Notes here",
    marks: [
      {
        type: "link",
        start: 4,
        end: 9,
        href: "https://site.test/notes",
        pageId: "page-1",
      },
    ],
  },
  {
    name: "a plain link",
    text: "go here now",
    marks: [{ type: "link", start: 3, end: 7, href: "https://site.test" }],
  },
  {
    name: "a formula token",
    text: `a${FORMULA_TOKEN_SENTINEL}b`,
    marks: [{ type: "formula", start: 1, end: 2, expression: "1 + 1" }],
  },
];

describe("rich text selection offsets", () => {
  for (const field of FIELDS) {
    it(`round-trips every range in ${field.name}`, () => {
      const root = mountField(field.text, field.marks);
      expect(serializeRichTextDom(root).text).toBe(field.text);

      const mismatched: string[] = [];
      for (let start = 0; start <= field.text.length; start += 1) {
        for (let end = start; end <= field.text.length; end += 1) {
          setRichTextSelection(root, { start, end });
          const read = getRichTextSelection(root);
          if (read?.start !== start || read?.end !== end) {
            mismatched.push(`[${start}, ${end}) → ${JSON.stringify(read)}`);
          }
        }
      }
      expect(mismatched).toEqual([]);
    });
  }

  it("maps a selection inside a marked run to the run's own offsets", () => {
    const root = mountField("hello world", [
      { type: "bold", start: 0, end: 5 },
    ]);
    const boldText = (root.firstChild as HTMLElement).firstChild as Text;
    selectDom(boldText, 1, boldText, 4);

    expect(getRichTextSelection(root)).toEqual({ start: 1, end: 4 });
  });

  it("maps a selection spanning a run boundary", () => {
    const root = mountField("hello world", [
      { type: "bold", start: 0, end: 5 },
    ]);
    const boldText = (root.firstChild as HTMLElement).firstChild as Text;
    const tail = root.lastChild as Text;
    selectDom(boldText, 2, tail, 3);

    expect(getRichTextSelection(root)).toEqual({ start: 2, end: 8 });
  });

  it("maps element-container endpoints (select-all, run boundaries)", () => {
    const root = mountField("hello world", [
      { type: "bold", start: 0, end: 5 },
    ]);

    selectDom(root, 0, root, root.childNodes.length);
    expect(getRichTextSelection(root)).toEqual({ start: 0, end: 11 });

    // End = "after the bold span" expressed as a child index of the root.
    selectDom(root, 0, root, 1);
    expect(getRichTextSelection(root)).toEqual({ start: 0, end: 5 });
  });

  it("counts a page link as its title run, not its chrome", () => {
    const root = mountField("see Notes here", [
      {
        type: "link",
        start: 4,
        end: 9,
        href: "https://site.test/notes",
        pageId: "page-1",
      },
    ]);
    const head = root.firstChild as Text;
    const tail = root.lastChild as Text;
    selectDom(head, 2, tail, 3);

    expect(getRichTextSelection(root)).toEqual({ start: 2, end: 12 });
  });

  it("resolves a click on a token's value to the offset after the token", () => {
    const root = mountField(`a${FORMULA_TOKEN_SENTINEL}b`, [
      { type: "formula", start: 1, end: 2, expression: "1 + 1" },
    ]);
    const valueHost = root.querySelector(
      "[data-inline-formula-chrome]"
    ) as HTMLElement;
    selectDom(valueHost, 0, valueHost, 0);

    expect(getRichTextSelection(root)).toEqual({ start: 2, end: 2 });
  });
});
