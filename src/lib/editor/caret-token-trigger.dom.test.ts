/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";

import { readCaretTokenContext } from "@/lib/editor/caret-token-trigger.ts";
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

  it("reads a # formula trigger", () => {
    mountField("x #", 3);
    expect(readCaretTokenContext("#")).toMatchObject({
      trigger: "#",
      query: "",
      start: 2,
      end: 3,
    });
  });

  it("rejects whitespace inside the query", () => {
    mountField("@a b", 4);
    expect(readCaretTokenContext("@")).toBeNull();
  });
});
