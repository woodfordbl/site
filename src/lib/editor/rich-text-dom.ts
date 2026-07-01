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

function marksForNode(node: Node, root: HTMLElement): InlineMarkType[] {
  const collected = new Set<InlineMarkType>();
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
    element = element.parentElement;
  }
  return [...collected];
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
    .map((segment) =>
      segment.marks.length === 0
        ? escapeHtml(segment.text)
        : `<span data-marks="${segment.marks.join(" ")}" class="${classForMarks(
            segment.marks
          )}">${escapeHtml(segment.text)}</span>`
    )
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
      for (const type of marksForNode(node, root)) {
        marks.push({ type, start, end: start + length });
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
