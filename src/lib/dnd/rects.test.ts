// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { collectRects } from "@/lib/dnd/rects.ts";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("collectRects", () => {
  it("keys rects by the attribute value", () => {
    document.body.innerHTML = `
      <div data-row-id="a"></div>
      <div data-row-id="b"></div>
      <div data-other="c"></div>
    `;

    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const id = this.getAttribute("data-row-id");
        return { top: id === "a" ? 0 : 50 } as DOMRect;
      }
    );

    const rects = collectRects("data-row-id");
    expect([...rects.keys()].sort()).toEqual(["a", "b"]);
    expect(rects.get("a")?.top).toBe(0);
    expect(rects.get("b")?.top).toBe(50);
  });

  it("returns an empty map when no elements match", () => {
    expect(collectRects("data-missing").size).toBe(0);
  });
});
