/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";

import {
  FORMULA_TRIGGER_CHAR,
  readCaretTokenContext,
  restoreCaretAfterToken,
} from "@/lib/editor/caret-token-trigger.ts";
import {
  richTextToHtml,
  setRichTextSelection,
} from "@/lib/editor/rich-text-dom.ts";

function mountField(text: string, caret: number): HTMLDivElement {
  const root = document.createElement("div");
  root.setAttribute("data-canvas-field", "");
  root.setAttribute("contenteditable", "true");
  root.tabIndex = 0;
  root.innerHTML = richTextToHtml(text, [], () => "marked");
  document.body.append(root);
  Object.defineProperty(document, "activeElement", {
    configurable: true,
    get: () => root,
  });
  setRichTextSelection(root, { start: caret, end: caret });
  return root;
}

afterEach(() => {
  document.body.replaceChildren();
  // biome-ignore lint/performance/noDelete: restore document prototype behavior after stub
  delete (document as { activeElement?: Element }).activeElement;
});

describe("readCaretTokenContext", () => {
  it("reads an @ mention query at a word boundary", () => {
    mountField("Hello @no", 9);
    const context = readCaretTokenContext("@");
    expect(context).toMatchObject({
      trigger: "@",
      query: "no",
      start: 6,
      end: 9,
    });
  });

  it("ignores @ mid-word", () => {
    mountField("a@b", 3);
    expect(readCaretTokenContext("@")).toBeNull();
  });

  it("reads a $ formula trigger", () => {
    mountField("x $", 3);
    expect(readCaretTokenContext(FORMULA_TRIGGER_CHAR)).toMatchObject({
      trigger: "$",
      query: "",
      start: 2,
      end: 3,
    });
  });

  it("leaves $ mid-word literal, so prices stay text", () => {
    mountField("US$5", 4);
    expect(readCaretTokenContext(FORMULA_TRIGGER_CHAR)).toBeNull();
  });

  it("rejects whitespace inside the query", () => {
    mountField("@a b", 4);
    expect(readCaretTokenContext("@")).toBeNull();
  });
});

describe("restoreCaretAfterToken", () => {
  it("returns focus and a collapsed caret to the end of the run", () => {
    const field = mountField("x $rate", 7);
    const context = readCaretTokenContext(FORMULA_TRIGGER_CHAR);
    if (context === null) {
      throw new Error("Test setup: $rate should read as a trigger run");
    }
    // The popover blurs the field while it is open.
    field.blur();

    expect(restoreCaretAfterToken(context)).toBe(true);
    const selection = document.getSelection();
    expect(selection?.isCollapsed).toBe(true);
    // Caret sits after the typed run, so typing continues the plain text.
    expect(readCaretTokenContext(FORMULA_TRIGGER_CHAR)).toMatchObject({
      end: 7,
      query: "rate",
    });
  });

  it("is a no-op once the field has left the document", () => {
    const field = mountField("x $", 3);
    const context = readCaretTokenContext(FORMULA_TRIGGER_CHAR);
    if (context === null) {
      throw new Error("Test setup: $ should read as a trigger run");
    }
    field.remove();
    expect(restoreCaretAfterToken(context)).toBe(false);
  });
});
