/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";

import { serializeFormulaDom } from "@/lib/editor/formula-dom.ts";

/** Build a field root with the given inner HTML. */
function fieldWith(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

describe("serializeFormulaDom", () => {
  it("reads plain colored token spans as their text", () => {
    const root = fieldWith(
      '<span class="fn">round</span><span>(</span><span class="num">2.5</span><span>)</span>'
    );
    expect(serializeFormulaDom(root)).toBe("round(2.5)");
  });

  it("reads a chip as its data-source, not its rendered label", () => {
    const root = fieldWith(
      "<span>round(</span>" +
        '<span data-formula-chip data-source="thisPage.Price" contenteditable="false">' +
        '<span class="chip-glyph">#</span>Price</span>' +
        "<span>)</span>"
    );
    // The chip renders "#Price" but must serialize to its full source.
    expect(serializeFormulaDom(root)).toBe("round(thisPage.Price)");
  });

  it("handles bracket-form chips and surrounding operators", () => {
    const root = fieldWith(
      '<span data-formula-chip data-source="thisPage[&quot;Unit Price&quot;]" contenteditable="false">Unit Price</span>' +
        '<span> </span><span class="op">&gt;</span><span> </span><span class="num">0</span>'
    );
    expect(serializeFormulaDom(root)).toBe('thisPage["Unit Price"] > 0');
  });

  it("is empty for an empty field", () => {
    expect(serializeFormulaDom(fieldWith(""))).toBe("");
  });
});
