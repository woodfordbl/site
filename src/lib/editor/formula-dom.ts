/**
 * DOM ↔ source bridge for the formula code field's contenteditable surface.
 *
 * The surface renders the formula source as a flat run of leaf "atoms": text
 * nodes (colored token runs) and atomic **chip** elements (`data-formula-chip`
 * with the full reference in `data-source`, e.g. `thisPage.Weight`). A chip's
 * caret length is its SOURCE length, not its rendered width — so offset math
 * cannot use `Range.toString()` (which would count the chip's short label).
 * These helpers walk atoms and sum source lengths instead.
 */

export interface FormulaCaret {
  end: number;
  start: number;
}

interface FormulaAtom {
  length: number;
  node: Node;
  source: string;
}

/** Source text a single leaf node contributes (chip → its stored reference). */
function atomSource(node: Node): string | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  if (node instanceof HTMLElement) {
    if (node.dataset.source !== undefined) {
      return node.dataset.source;
    }
    if (node.tagName === "BR") {
      return "\n";
    }
  }
  return null;
}

/**
 * Leaf atoms of the field in document order. Chip elements are atomic — their
 * subtree is never descended into, so the icon/label markup inside a chip does
 * not leak into the source.
 */
function collectAtoms(root: HTMLElement): FormulaAtom[] {
  const atoms: FormulaAtom[] = [];
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT + NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        if (node instanceof HTMLElement && node.dataset.source !== undefined) {
          return NodeFilter.FILTER_ACCEPT;
        }
        if (node.nodeType === Node.TEXT_NODE) {
          // A text node inside a chip belongs to the chip, not the source.
          return node.parentElement?.closest("[data-formula-chip]")
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
        }
        if (node instanceof HTMLElement && node.tagName === "BR") {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      },
    }
  );
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const source = atomSource(node);
    if (source !== null) {
      atoms.push({ node, source, length: source.length });
    }
  }
  return atoms;
}

/** Read the whole formula source out of the field DOM. */
export function serializeFormulaDom(root: HTMLElement): string {
  let text = "";
  for (const atom of collectAtoms(root)) {
    text += atom.source;
  }
  return text;
}

/** Source length a node contributes (chips atomic; elements recurse). */
function nodeSourceLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? "").length;
  }
  if (node instanceof HTMLElement) {
    if (node.dataset.source !== undefined) {
      return node.dataset.source.length;
    }
    if (node.tagName === "BR") {
      return 1;
    }
    let total = 0;
    for (const child of node.childNodes) {
      total += nodeSourceLength(child);
    }
    return total;
  }
  return 0;
}

/** Total source length before `node` in document order (its preceding content). */
function sourceOffsetBefore(root: HTMLElement, node: Node): number {
  let total = 0;
  let current: Node | null = node;
  while (current && current !== root) {
    for (
      let sibling = current.previousSibling;
      sibling;
      sibling = sibling.previousSibling
    ) {
      total += nodeSourceLength(sibling);
    }
    current = current.parentNode;
  }
  return total;
}

/** A DOM point (container + offset) → source offset. */
function pointToOffset(
  root: HTMLElement,
  container: Node,
  containerOffset: number
): number {
  if (container.nodeType === Node.TEXT_NODE) {
    const within = Math.min(
      containerOffset,
      (container.textContent ?? "").length
    );
    return sourceOffsetBefore(root, container) + within;
  }
  // Element container: the point is the boundary before childNodes[offset]
  // (or the container's end when offset is past its last child).
  const reference = container.childNodes[containerOffset] ?? null;
  return reference
    ? sourceOffsetBefore(root, reference)
    : sourceOffsetBefore(root, container) + nodeSourceLength(container);
}

/** Current DOM selection as source offsets, or `null` when outside the field. */
export function getFormulaCaret(root: HTMLElement): FormulaCaret | null {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (
    !(root.contains(range.startContainer) && root.contains(range.endContainer))
  ) {
    return null;
  }
  const start = pointToOffset(root, range.startContainer, range.startOffset);
  const end = pointToOffset(root, range.endContainer, range.endOffset);
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

interface DomPoint {
  node: Node;
  offset: number;
}

/** Source offset → DOM point, snapping into text and to chip boundaries. */
function offsetToPoint(root: HTMLElement, offset: number): DomPoint {
  const atoms = collectAtoms(root);
  let remaining = Math.max(0, offset);
  for (const atom of atoms) {
    if (remaining <= atom.length) {
      if (atom.node.nodeType === Node.TEXT_NODE) {
        return { node: atom.node, offset: remaining };
      }
      // Atomic (chip / br): sit just before it, or after when past its start.
      const parent = atom.node.parentNode;
      if (!parent) {
        break;
      }
      const index = Array.prototype.indexOf.call(parent.childNodes, atom.node);
      return { node: parent, offset: remaining === 0 ? index : index + 1 };
    }
    remaining -= atom.length;
  }
  // Past the end: after the last atom, else the empty field.
  const last = atoms.at(-1);
  if (last) {
    if (last.node.nodeType === Node.TEXT_NODE) {
      return { node: last.node, offset: last.length };
    }
    const parent = last.node.parentNode;
    if (parent) {
      const index = Array.prototype.indexOf.call(parent.childNodes, last.node);
      return { node: parent, offset: index + 1 };
    }
  }
  return { node: root, offset: root.childNodes.length };
}

/** Place the DOM selection at the given source offsets. */
export function setFormulaCaret(root: HTMLElement, caret: FormulaCaret): void {
  const selection = root.ownerDocument.getSelection();
  if (!selection) {
    return;
  }
  const start = offsetToPoint(root, caret.start);
  const end = offsetToPoint(root, caret.end);
  const range = root.ownerDocument.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}
