import {
  normalizeInlineMarks,
  segmentRichText,
} from "@/lib/blocks/rich-text.ts";
import type { FieldSelection } from "@/lib/editor/caret-navigation.ts";
import type { InlineMark, InlineMarkType } from "@/lib/schemas/rich-text.ts";

/**
 * DOM ↔ model bridge for the rich-text contenteditable surface. The model is
 * `(text, marks)` with `FieldSelection` character offsets; the DOM is a flat
 * sequence of text nodes (unmarked runs) and `<span data-marks="…">` elements
 * (marked runs) under the field root. Newlines are literal `\n` characters
 * rendered via `white-space: pre-wrap`; `<br>` is tolerated on read.
 */

export interface RichTextDomSnapshot {
  marks: InlineMark[];
  text: string;
}

/** Element tags whose formatting we honor if the browser ever inserts them. */
const TAG_MARKS: Record<string, InlineMarkType> = {
  B: "bold",
  STRONG: "bold",
  I: "italic",
  EM: "italic",
  U: "underline",
  S: "strikethrough",
  STRIKE: "strikethrough",
  DEL: "strikethrough",
  CODE: "code",
};

interface NodeMarks {
  href?: string;
  types: InlineMarkType[];
}

function marksForNode(node: Node, root: HTMLElement): NodeMarks {
  const collected = new Set<InlineMarkType>();
  let href: string | undefined;
  let element = node.parentElement;
  while (element && element !== root) {
    const tokens = element.dataset.marks;
    if (tokens) {
      for (const token of tokens.split(" ")) {
        collected.add(token as InlineMarkType);
      }
    }
    const tagMark = TAG_MARKS[element.tagName];
    if (tagMark) {
      collected.add(tagMark);
    }
    if (element.tagName === "A") {
      collected.add("link");
      // Prefer the raw stored href; `getAttribute` avoids the browser's
      // absolute-URL resolution of the `href` property.
      href =
        element.dataset.href ?? element.getAttribute("href") ?? href;
    }
    element = element.parentElement;
  }
  return { types: [...collected], href };
}

function walkTextAndBreaks(
  root: HTMLElement,
  visit: (node: Node, length: number) => boolean | undefined
): void {
  // Distinct bit flags, so addition equals the bitwise union.
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT + NodeFilter.SHOW_ELEMENT
  );
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (visit(node, (node.textContent ?? "").length)) {
        return;
      }
    } else if ((node as Element).tagName === "BR" && visit(node, 1)) {
      return;
    }
  }
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => HTML_ESCAPES[char] ?? char);
}

/**
 * `(text, marks)` → the field's DOM as an HTML string. Used for the initial
 * (and server-rendered) markup of the editable surface; after mount the field
 * maintains its DOM imperatively.
 */
export function richTextToHtml(
  text: string,
  marks: readonly InlineMark[],
  classForMarks: (types: readonly InlineMarkType[]) => string
): string {
  return segmentRichText(text, marks)
    .map((segment) => {
      if (segment.marks.length === 0) {
        return escapeHtml(segment.text);
      }
      const attrs = `data-marks="${segment.marks.join(
        " "
      )}" class="${classForMarks(segment.marks)}"`;
      if (segment.href) {
        const url = escapeHtml(segment.href);
        return `<a href="${url}" data-href="${url}" ${attrs}>${escapeHtml(
          segment.text
        )}</a>`;
      }
      return `<span ${attrs}>${escapeHtml(segment.text)}</span>`;
    })
    .join("");
}

/** Read `(text, marks)` out of the live field DOM. */
export function serializeRichTextDom(root: HTMLElement): RichTextDomSnapshot {
  let text = "";
  const marks: InlineMark[] = [];

  walkTextAndBreaks(root, (node, length) => {
    const start = text.length;
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? "";
      const { types, href } = marksForNode(node, root);
      for (const type of types) {
        marks.push({
          type,
          start,
          end: start + length,
          ...(type === "link" && href !== undefined ? { href } : {}),
        });
      }
    } else {
      text += "\n";
    }
    return false;
  });

  return { text, marks: normalizeInlineMarks(marks, text.length) };
}

interface DomPosition {
  node: Node;
  offset: number;
}

/** Model offset → DOM position (clamped to the content length). */
export function resolveRichTextPosition(
  root: HTMLElement,
  offset: number
): DomPosition {
  let remaining = Math.max(0, offset);
  let position: DomPosition | null = null;
  let lastText: DomPosition | null = null;

  walkTextAndBreaks(root, (node, length) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (remaining <= length) {
        position = { node, offset: remaining };
        return true;
      }
      lastText = { node, offset: length };
    } else if (remaining === 0) {
      // Caret directly before a <br>.
      const parent = node.parentNode;
      if (parent) {
        position = {
          node: parent,
          offset: Array.prototype.indexOf.call(parent.childNodes, node),
        };
      }
      return true;
    }
    remaining -= length;
    return false;
  });

  return position ?? lastText ?? { node: root, offset: 0 };
}

/**
 * DOM point → model offset: length of the content between the field start and
 * the point. `Range.toString()` concatenates text nodes; `<br>`s inside the
 * range each count one `\n`.
 */
function textOffsetForPoint(
  root: HTMLElement,
  targetNode: Node,
  targetOffset: number
): number {
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(root);
  try {
    range.setEnd(targetNode, targetOffset);
  } catch {
    return 0;
  }
  const fragment = range.cloneContents();
  const breaks = fragment.querySelectorAll("br").length;
  return range.toString().length + breaks;
}

/** Current DOM selection as model offsets, or null when outside the field. */
export function getRichTextSelection(root: HTMLElement): FieldSelection | null {
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
  const start = textOffsetForPoint(
    root,
    range.startContainer,
    range.startOffset
  );
  const end = textOffsetForPoint(root, range.endContainer, range.endOffset);
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

/** Place the DOM selection at the given model offsets. */
export function setRichTextSelection(
  root: HTMLElement,
  selection: FieldSelection
): void {
  const doc = root.ownerDocument;
  const domSelection = doc.getSelection();
  if (!domSelection) {
    return;
  }
  const range = doc.createRange();
  const start = resolveRichTextPosition(root, selection.start);
  const end = resolveRichTextPosition(root, selection.end);
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  domSelection.removeAllRanges();
  domSelection.addRange(range);
}

/** Replace `[start, end)` with plain text at the DOM level (paste, newline). */
export function insertPlainTextAtSelection(
  root: HTMLElement,
  text: string
): void {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) {
    return;
  }
  range.deleteContents();
  const node = root.ownerDocument.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.setEndAfter(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Wrap the current (non-collapsed) selection in a link to `url`, keeping the
 * selected text as the label. `linkClassName` must match what the model rebuild
 * would produce so the freshly-inserted anchor is styled without a reflow.
 */
export function insertLinkOverSelection(
  root: HTMLElement,
  url: string,
  linkClassName: string
): void {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || range.collapsed) {
    return;
  }
  const anchor = root.ownerDocument.createElement("a");
  anchor.setAttribute("href", url);
  anchor.dataset.href = url;
  anchor.dataset.marks = "link";
  anchor.className = linkClassName;
  anchor.append(range.extractContents());
  range.insertNode(anchor);
  range.setStartAfter(anchor);
  range.setEndAfter(anchor);
  selection.removeAllRanges();
  selection.addRange(range);
}
