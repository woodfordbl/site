/** @vitest-environment jsdom */
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  DROPDOWN_MENU_SEPARATOR_SLOT,
  isMenuSeparatorVisuallyHidden,
  MENU_SEPARATOR_ORPHAN_CSS,
} from "@/lib/ui/menu-separators.ts";

function sep(): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-slot", DROPDOWN_MENU_SEPARATOR_SLOT);
  return el;
}

function item(label: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-slot", "dropdown-menu-item");
  el.textContent = label;
  return el;
}

beforeAll(() => {
  const style = document.createElement("style");
  style.textContent = MENU_SEPARATOR_ORPHAN_CSS;
  document.head.appendChild(style);
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("menu separator orphan CSS", () => {
  it("hides a leading separator", () => {
    const root = document.createElement("div");
    root.append(sep(), item("A"));
    document.body.append(root);

    expect(isMenuSeparatorVisuallyHidden(root.children[0])).toBe(true);
    expect(getComputedStyle(root.children[1]).display).not.toBe("none");
  });

  it("hides a trailing separator", () => {
    const root = document.createElement("div");
    root.append(item("A"), sep());
    document.body.append(root);

    expect(isMenuSeparatorVisuallyHidden(root.children[1])).toBe(true);
  });

  it("hides the second of two adjacent separators", () => {
    const root = document.createElement("div");
    root.append(item("A"), sep(), sep(), item("B"));
    document.body.append(root);

    expect(isMenuSeparatorVisuallyHidden(root.children[1])).toBe(false);
    expect(isMenuSeparatorVisuallyHidden(root.children[2])).toBe(true);
  });

  it("hides a chain of trailing separators after content", () => {
    const root = document.createElement("div");
    root.append(item("A"), sep(), sep());
    document.body.append(root);

    expect(isMenuSeparatorVisuallyHidden(root.children[1])).toBe(true);
    expect(isMenuSeparatorVisuallyHidden(root.children[2])).toBe(true);
  });

  it("keeps a separator that divides two content sections", () => {
    const root = document.createElement("div");
    root.append(item("A"), sep(), item("B"));
    document.body.append(root);

    expect(isMenuSeparatorVisuallyHidden(root.children[1])).toBe(false);
  });
});
