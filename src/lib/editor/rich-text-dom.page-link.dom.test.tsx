/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";

import {
  insertLinkedTextAtSelection,
  repairInlinePageLinkDom,
  resolveRichTextPosition,
  richTextToHtml,
  serializeRichTextDom,
  setRichTextSelection,
} from "@/lib/editor/rich-text-dom.ts";
import type { InlineMark } from "@/lib/schemas/rich-text.ts";

const PAGE_LINK: InlineMark = {
  type: "link",
  start: 4,
  end: 9,
  href: "https://site.test/notes",
  pageId: "page-1",
};

function mountField(text: string, marks: InlineMark[]): HTMLDivElement {
  const root = document.createElement("div");
  root.contentEditable = "true";
  root.innerHTML = richTextToHtml(text, marks, () => "marked", {
    classForPageLink: () => "page-link",
  });
  document.body.append(root);
  return root;
}

function containerOf(node: Node | undefined): Element | null {
  if (!node) {
    return null;
  }
  return node.nodeType === Node.TEXT_NODE
    ? node.parentElement
    : (node as Element);
}

describe("inline page link DOM", () => {
  it("serializes pageId from data-page-id without chrome text", () => {
    const root = document.createElement("div");
    root.contentEditable = "true";
    document.body.append(root);
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);

    insertLinkedTextAtSelection(
      root,
      "https://site.test/notes",
      "inline-page-link",
      {
        pageId: "page-1",
        label: "Notes",
      }
    );

    // Simulate chrome filled with emoji text — must not enter the model.
    const icon = root.querySelector('[data-inline-page-link-chrome="icon"]');
    if (icon) {
      icon.textContent = "📄";
    }

    expect(serializeRichTextDom(root)).toEqual({
      text: "Notes",
      marks: [
        {
          type: "link",
          start: 0,
          end: 5,
          href: "https://site.test/notes",
          pageId: "page-1",
        },
      ],
    });

    root.remove();
  });

  it("renders the anchor as an atomic contenteditable=false run", () => {
    const root = mountField("hi  Notes", [PAGE_LINK]);
    const anchor = root.querySelector("a[data-page-id]");
    expect(anchor?.getAttribute("contenteditable")).toBe("false");
    root.remove();
  });

  it("resolves the offset just after a page link outside the anchor", () => {
    const root = mountField("hi  Notes", [PAGE_LINK]);
    const position = resolveRichTextPosition(root, 9);
    expect(containerOf(position.node)?.closest("a[data-page-id]")).toBeNull();
    root.remove();
  });

  it("resolves the offset before a leading page link outside the anchor", () => {
    const root = mountField("Notes", [{ ...PAGE_LINK, start: 0, end: 5 }]);
    setRichTextSelection(root, { start: 0, end: 0 });
    const container = containerOf(
      window.getSelection()?.getRangeAt(0).startContainer
    );
    expect(container?.closest("a[data-page-id]")).toBeNull();
    root.remove();
  });

  it("keeps a full-link selection covering the run", () => {
    const root = mountField("hi  Notes", [PAGE_LINK]);
    setRichTextSelection(root, { start: 4, end: 9 });
    expect(window.getSelection()?.toString()).toBe("Notes");
    root.remove();
  });

  it("lifts text typed at the end of a link out of the anchor", () => {
    const root = mountField("hi  Notes", [PAGE_LINK]);
    const anchor = root.querySelector("a[data-page-id]");
    anchor?.append(document.createTextNode("X"));

    expect(repairInlinePageLinkDom(root)).toBe(true);
    expect(serializeRichTextDom(root)).toEqual({
      text: "hi  NotesX",
      marks: [PAGE_LINK],
    });
    root.remove();
  });

  it("lifts text typed at the start of a link out of the anchor", () => {
    const root = mountField("hi  Notes", [PAGE_LINK]);
    const anchor = root.querySelector("a[data-page-id]");
    anchor?.prepend(document.createTextNode("X"));

    expect(repairInlinePageLinkDom(root)).toBe(true);
    expect(serializeRichTextDom(root)).toEqual({
      text: "hi  XNotes",
      marks: [{ ...PAGE_LINK, start: 5, end: 10 }],
    });
    root.remove();
  });

  it("leaves an untouched field alone", () => {
    const root = mountField("hi  Notes", [PAGE_LINK]);
    expect(repairInlinePageLinkDom(root)).toBe(false);
    root.remove();
  });

  it("renders one anchor when a styling mark partly covers the link", () => {
    const root = mountField("hi  Notes", [
      { type: "bold", start: 0, end: 6 },
      PAGE_LINK,
    ]);
    expect(root.querySelectorAll("a[data-page-id]")).toHaveLength(1);
    root.remove();
  });

  it("styles the title when a mark covers the whole link", () => {
    const root = mountField("hi  Notes", [
      { type: "bold", start: 0, end: 9 },
      PAGE_LINK,
    ]);
    const title = root.querySelector(
      "a[data-page-id] > span:not([data-inline-page-link-chrome])"
    );
    expect(title?.className).toContain("marked");
    root.remove();
  });
});
