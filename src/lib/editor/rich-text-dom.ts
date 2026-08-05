import {
  linkMarkExtras,
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
 *
 * Inline page links (`data-page-id`) may wrap title text with
 * `contenteditable=false` chrome hosts (`data-inline-page-link-chrome`) for the
 * icon and arrow — those hosts are excluded from text/mark serialization.
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
  pageId?: string;
  types: InlineMarkType[];
}

function isInlinePageLinkChrome(node: Node): boolean {
  const start =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  return Boolean(start?.closest("[data-inline-page-link-chrome]"));
}

function marksForNode(node: Node, root: HTMLElement): NodeMarks {
  const collected = new Set<InlineMarkType>();
  let href: string | undefined;
  let pageId: string | undefined;
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
      href = element.dataset.href ?? element.getAttribute("href") ?? href;
      pageId = element.dataset.pageId ?? pageId;
    }
    element = element.parentElement;
  }
  return {
    types: [...collected],
    ...(href === undefined ? {} : { href }),
    ...(pageId === undefined ? {} : { pageId }),
  };
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
    if (isInlinePageLinkChrome(node)) {
      continue;
    }
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

export interface RichTextHtmlOptions {
  /** Class for inline page-link anchors (`pageId` marks). */
  classForPageLink?: (types: readonly InlineMarkType[]) => string;
}

/**
 * `(text, marks)` → the field's DOM as an HTML string. Used for the initial
 * (and server-rendered) markup of the editable surface; after mount the field
 * maintains its DOM imperatively.
 */
export function richTextToHtml(
  text: string,
  marks: readonly InlineMark[],
  classForMarks: (types: readonly InlineMarkType[]) => string,
  options?: RichTextHtmlOptions
): string {
  return segmentRichText(text, marks)
    .map((segment) => {
      if (segment.marks.length === 0) {
        return escapeHtml(segment.text);
      }
      if (segment.href && segment.pageId) {
        const url = escapeHtml(segment.href);
        const pageId = escapeHtml(segment.pageId);
        const className = (options?.classForPageLink ?? classForMarks)(
          segment.marks
        );
        return `<a href="${url}" data-href="${url}" data-page-id="${pageId}" data-marks="${segment.marks.join(
          " "
        )}" class="${className}"><span data-inline-page-link-chrome="icon" contenteditable="false"></span><span class="underline underline-offset-4 decoration-border">${escapeHtml(
          segment.text
        )}</span><span data-inline-page-link-chrome="arrow" contenteditable="false"></span></a>`;
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
      const { types, href, pageId } = marksForNode(node, root);
      for (const type of types) {
        marks.push({
          type,
          start,
          end: start + length,
          ...(type === "link" ? linkMarkExtras({ href, pageId }) : {}),
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
 * the point. Skips inline page-link chrome so caret math matches serialization.
 */
function textOffsetForPoint(
  root: HTMLElement,
  targetNode: Node,
  targetOffset: number
): number {
  let endNode = targetNode;
  let endOffset = targetOffset;
  if (isInlinePageLinkChrome(targetNode)) {
    const anchor = (
      targetNode.nodeType === Node.ELEMENT_NODE
        ? (targetNode as Element)
        : targetNode.parentElement
    )?.closest("a[data-page-id]");
    const title = anchor?.querySelector(
      ":scope > span:not([data-inline-page-link-chrome])"
    );
    const titleText = title?.firstChild;
    if (titleText) {
      endNode = titleText;
      endOffset = 0;
    }
  }

  const range = root.ownerDocument.createRange();
  range.selectNodeContents(root);
  try {
    range.setEnd(endNode, endOffset);
  } catch {
    return 0;
  }

  let offset = 0;
  walkTextAndBreaks(root, (node, length) => {
    if (node.nodeType === Node.TEXT_NODE) {
      // comparePoint: -1 before range, 0 inside, 1 after.
      if (range.comparePoint(node, 0) === 1) {
        return true;
      }
      if (range.comparePoint(node, length) !== 1) {
        offset += length;
        return false;
      }
      for (let i = 0; i <= length; i += 1) {
        if (range.comparePoint(node, i) === 1) {
          offset += i;
          return true;
        }
      }
      offset += length;
      return false;
    }
    if (range.comparePoint(node, 0) === 1) {
      return true;
    }
    offset += length;
    return false;
  });
  return offset;
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

export interface CreateLinkAnchorOptions {
  /** Label text when inserting linked text (defaults to `url`). */
  label?: string;
  /** Workspace page id — builds an inline page-link anchor. */
  pageId?: string;
}

function createLinkAnchor(
  doc: Document,
  url: string,
  linkClassName: string,
  options?: CreateLinkAnchorOptions
): HTMLAnchorElement {
  const anchor = doc.createElement("a");
  anchor.setAttribute("href", url);
  anchor.dataset.href = url;
  anchor.dataset.marks = "link";
  anchor.className = linkClassName;
  if (options?.pageId) {
    anchor.dataset.pageId = options.pageId;
    const icon = doc.createElement("span");
    icon.dataset.inlinePageLinkChrome = "icon";
    icon.contentEditable = "false";
    const title = doc.createElement("span");
    title.className = "underline underline-offset-4 decoration-border";
    title.textContent = options.label ?? url;
    const arrow = doc.createElement("span");
    arrow.dataset.inlinePageLinkChrome = "arrow";
    arrow.contentEditable = "false";
    anchor.append(icon, title, arrow);
  }
  return anchor;
}

/**
 * Wrap the current (non-collapsed) selection in a link to `url`, keeping the
 * selected text as the label. `linkClassName` must match what the model rebuild
 * would produce so the freshly-inserted anchor is styled without a reflow.
 */
export function insertLinkOverSelection(
  root: HTMLElement,
  url: string,
  linkClassName: string,
  options?: CreateLinkAnchorOptions
): void {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || range.collapsed) {
    return;
  }
  if (options?.pageId) {
    const label = range.toString();
    range.deleteContents();
    const anchor = createLinkAnchor(root.ownerDocument, url, linkClassName, {
      pageId: options.pageId,
      label: label || options.label || url,
    });
    range.insertNode(anchor);
    range.setStartAfter(anchor);
    range.setEndAfter(anchor);
  } else {
    const anchor = createLinkAnchor(root.ownerDocument, url, linkClassName);
    anchor.append(range.extractContents());
    range.insertNode(anchor);
    range.setStartAfter(anchor);
    range.setEndAfter(anchor);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Insert linked text at the caret (paste-to-link when nothing is selected).
 * Pass `pageId` + `label` for an inline page link; otherwise the label defaults
 * to the URL string.
 */
export function insertLinkedTextAtSelection(
  root: HTMLElement,
  url: string,
  linkClassName: string,
  options?: CreateLinkAnchorOptions
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
  const anchor = createLinkAnchor(
    root.ownerDocument,
    url,
    linkClassName,
    options
  );
  if (!options?.pageId) {
    anchor.append(root.ownerDocument.createTextNode(options?.label ?? url));
  }
  range.insertNode(anchor);
  range.setStartAfter(anchor);
  range.setEndAfter(anchor);
  selection.removeAllRanges();
  selection.addRange(range);
}
