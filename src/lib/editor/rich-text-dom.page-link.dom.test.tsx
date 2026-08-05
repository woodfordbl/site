/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";

import {
  insertLinkedTextAtSelection,
  serializeRichTextDom,
} from "@/lib/editor/rich-text-dom.ts";

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
});
