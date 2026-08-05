/**
 * Shared helpers for menu separator orphan detection. The visual safety net
 * lives in `styles.css` (leading / trailing / adjacent `display: none` on
 * `[data-slot=*-separator]` and `[data-menu-card-break]`); these helpers let
 * tests assert the same invariants against a rendered menu tree.
 */

export const DROPDOWN_MENU_SEPARATOR_SLOT = "dropdown-menu-separator";
export const CONTEXT_MENU_SEPARATOR_SLOT = "context-menu-separator";
export const MENU_CARD_BREAK_ATTRIBUTE = "data-menu-card-break";

const SEPARATOR_SELECTOR = [
  `[data-slot="${DROPDOWN_MENU_SEPARATOR_SLOT}"]`,
  `[data-slot="${CONTEXT_MENU_SEPARATOR_SLOT}"]`,
  `[${MENU_CARD_BREAK_ATTRIBUTE}]`,
].join(", ");

function isSeparatorElement(node: Element): boolean {
  const slot = node.getAttribute("data-slot");
  return (
    slot === DROPDOWN_MENU_SEPARATOR_SLOT ||
    slot === CONTEXT_MENU_SEPARATOR_SLOT ||
    node.hasAttribute(MENU_CARD_BREAK_ATTRIBUTE)
  );
}

function elementChildren(parent: ParentNode): Element[] {
  return Array.from(parent.children).filter(
    (child): child is Element => child instanceof Element
  );
}

/**
 * Walks every element under `root` and throws if any sibling list contains a
 * leading, trailing, or adjacent menu separator. Ignores CSS visibility — this
 * catches React trees that still emit orphan separator nodes (the CSS safety
 * net hides them, but call sites should ideally not emit them either).
 */
export function assertNoOrphanMenuSeparators(root: ParentNode): void {
  const parents = new Set<ParentNode>();
  parents.add(root);
  for (const separator of root.querySelectorAll(SEPARATOR_SELECTOR)) {
    if (separator.parentNode) {
      parents.add(separator.parentNode);
    }
  }

  for (const parent of parents) {
    const children = elementChildren(parent);
    if (children.length === 0) {
      continue;
    }

    if (isSeparatorElement(children[0])) {
      throw new Error(
        "Leading menu separator: first child of a menu container is a separator."
      );
    }

    if (isSeparatorElement(children.at(-1) as Element)) {
      throw new Error(
        "Trailing menu separator: last child of a menu container is a separator."
      );
    }

    for (let index = 1; index < children.length; index += 1) {
      const previous = children[index - 1];
      const current = children[index];
      if (isSeparatorElement(previous) && isSeparatorElement(current)) {
        throw new Error(
          "Adjacent menu separators: two separators are siblings with nothing between them."
        );
      }
    }
  }
}

/**
 * CSS rules that suppress orphan menu separators. Kept here so DOM tests can
 * inject the same safety net without loading the full stylesheet.
 */
export const MENU_SEPARATOR_ORPHAN_CSS = `
[data-slot="dropdown-menu-separator"]:first-child,
[data-slot="context-menu-separator"]:first-child,
[data-menu-card-break]:first-child {
  display: none;
}
[data-slot="dropdown-menu-separator"] + [data-slot="dropdown-menu-separator"],
[data-slot="context-menu-separator"] + [data-slot="context-menu-separator"],
[data-menu-card-break] + [data-menu-card-break] {
  display: none;
}
[data-slot="dropdown-menu-separator"]:not(:has(~ :not([data-slot="dropdown-menu-separator"]))),
[data-slot="context-menu-separator"]:not(:has(~ :not([data-slot="context-menu-separator"]))),
[data-menu-card-break]:not(:has(~ :not([data-menu-card-break]))) {
  display: none;
}
`;

export function isMenuSeparatorVisuallyHidden(element: Element): boolean {
  return getComputedStyle(element).display === "none";
}
