import {
  linkMarkExtras,
  normalizeInlineMarks,
  segmentRichText,
} from "@/lib/blocks/rich-text.ts";
import type { FieldSelection } from "@/lib/editor/caret-navigation.ts";
import { pageTitleUnderlineClassName } from "@/lib/pages/page-link-display.ts";
import type { InlineMark, InlineMarkType } from "@/lib/schemas/rich-text.ts";
import { FORMULA_TOKEN_SENTINEL } from "@/lib/schemas/rich-text.ts";

/**
 * DOM ↔ model bridge for the rich-text contenteditable surface. The model is
 * `(text, marks)` with `FieldSelection` character offsets; the DOM is a flat
 * sequence of text nodes (unmarked runs) and `<span data-marks="…">` elements
 * (marked runs) under the field root. Newlines are literal `\n` characters
 * rendered via `white-space: pre-wrap`; `<br>` is tolerated on read.
 *
 * Inline page links (`data-page-id`) are **atomic**: the whole anchor is
 * `contenteditable=false`, so the caret can only sit before or after it and the
 * browser deletes it as one unit. Its icon/arrow chrome hosts
 * (`data-inline-page-link-chrome`) are excluded from text/mark serialization,
 * so the model text of a page link is exactly its title run.
 *
 * Inline formula tokens (`data-formula-token`) are atomic too, but invert the
 * relationship: **none** of their DOM is serialized. The element stands in for
 * exactly one {@link FORMULA_TOKEN_SENTINEL} character, the way a `<br>` stands
 * in for one `\n` — so the value on screen is pure presentation and can be
 * rewritten (see {@link applyInlineFormulaValues}) without the model, the undo
 * history, or the conflict baseline noticing. Keeping the sentinel out of the
 * DOM entirely also means the browser has no text node to split, merge, or
 * autocorrect it into something else.
 */

/** Anchors that render an inline page link (icon + title + arrow). */
export const PAGE_LINK_ANCHOR_SELECTOR = "a[data-page-id]";
/** The title span inside a page-link anchor — the only serialized child. */
const PAGE_LINK_TITLE_SELECTOR =
  ":scope > span:not([data-inline-page-link-chrome])";
/** Elements standing in for one inline formula token. */
export const FORMULA_TOKEN_SELECTOR = "[data-formula-token]";
/** The presentation host inside a token — holds the rendered value. */
const FORMULA_VALUE_SELECTOR = "[data-inline-formula-chrome]";
/** Shown in a token whose value has not resolved yet. */
export const PENDING_FORMULA_VALUE = "…";

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

function elementFor(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement;
}

function isInlinePageLinkChrome(node: Node): boolean {
  return Boolean(elementFor(node)?.closest("[data-inline-page-link-chrome]"));
}

/** Whether `node` is the element standing in for a formula token. */
export function isFormulaTokenElement(node: Node): boolean {
  return (
    node.nodeType === Node.ELEMENT_NODE &&
    (node as Element).matches(FORMULA_TOKEN_SELECTOR)
  );
}

/**
 * Everything strictly *inside* a token is presentation. Checking descendancy
 * rather than a chrome attribute is deliberate: whatever the browser drops in
 * there — an autocorrect text node, an IME composition — is excluded from the
 * model on the same terms as the value we put there ourselves.
 */
function isInsideFormulaToken(node: Node): boolean {
  const token = elementFor(node)?.closest(FORMULA_TOKEN_SELECTOR);
  return token !== null && token !== undefined && token !== node;
}

/** Nodes that carry no model text of their own. */
function isChrome(node: Node): boolean {
  return isInlinePageLinkChrome(node) || isInsideFormulaToken(node);
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
    if (isChrome(node)) {
      continue;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      if (visit(node, (node.textContent ?? "").length)) {
        return;
      }
    } else if (
      // Both stand in for exactly one character: `<br>` for `\n`, a formula
      // token for its sentinel.
      ((node as Element).tagName === "BR" || isFormulaTokenElement(node)) &&
      visit(node, 1)
    ) {
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
 * Styling marks carried by a page-link run. `link` is dropped — page links wear
 * their own chrome (icon + bordered underline + arrow), not the link palette.
 */
export function pageLinkTitleMarks(
  marks: readonly InlineMarkType[]
): InlineMarkType[] {
  return marks.filter((type) => type !== "link");
}

export interface InlinePageLinkAnchorOptions {
  /** Class for the anchor element (page-link chrome layout). */
  className: string;
  href: string;
  /** `data-marks` tokens for the run. */
  markTokens: string;
  pageId: string;
  /** The run's model text (the page title snapshot). */
  text: string;
  /** Extra classes for the title span (styling marks). */
  titleClassName?: string;
}

/**
 * Builds the atomic page-link anchor. The single source of this DOM shape —
 * `richTextToHtml`, the field rebuild, and paste-time insertion must agree, or
 * the field would flicker between two spellings of the same run.
 */
export function createInlinePageLinkAnchor(
  doc: Document,
  options: InlinePageLinkAnchorOptions
): HTMLAnchorElement {
  const anchor = doc.createElement("a");
  anchor.setAttribute("href", options.href);
  anchor.dataset.href = options.href;
  anchor.dataset.pageId = options.pageId;
  anchor.dataset.marks = options.markTokens;
  anchor.className = options.className;
  // Atomic: the caret cannot enter, so typing at either edge stays outside the
  // link and Backspace removes the whole run.
  anchor.contentEditable = "false";
  const icon = doc.createElement("span");
  icon.dataset.inlinePageLinkChrome = "icon";
  const title = doc.createElement("span");
  title.className = options.titleClassName
    ? `${pageTitleUnderlineClassName} ${options.titleClassName}`
    : pageTitleUnderlineClassName;
  title.textContent = options.text;
  const arrow = doc.createElement("span");
  arrow.dataset.inlinePageLinkChrome = "arrow";
  anchor.append(icon, title, arrow);
  return anchor;
}

export interface InlineFormulaTokenOptions {
  /** Class for the token element. */
  className: string;
  /** The token's source, round-tripped through `data-expression`. */
  expression: string;
  /** Rendered value; defaults to the pending placeholder. */
  value?: string;
}

/**
 * Builds the atomic formula-token element. Like the page-link anchor this is
 * the single source of the DOM shape — `richTextToHtml`, the field rebuild, and
 * any insertion path must agree, or the field would flicker between two
 * spellings of the same token.
 */
export function createInlineFormulaToken(
  doc: Document,
  options: InlineFormulaTokenOptions
): HTMLSpanElement {
  const token = doc.createElement("span");
  token.dataset.formulaToken = "";
  token.dataset.expression = options.expression;
  token.dataset.marks = "formula";
  token.className = options.className;
  token.title = options.expression;
  // Atomic, and for a stronger reason than page links: the model text is a
  // sentinel that lives nowhere in this subtree, so a caret inside would have
  // no offset to map to. Set as an attribute rather than via `contentEditable`
  // so the element matches the parsed HTML exactly (jsdom has no IDL property).
  token.setAttribute("contenteditable", "false");
  const value = doc.createElement("span");
  value.dataset.inlineFormulaChrome = "value";
  value.textContent = options.value ?? PENDING_FORMULA_VALUE;
  token.append(value);
  return token;
}

/**
 * Rewrite each token's displayed value in place, keyed by the token's model
 * offset (the same key {@link InlineMark.start} uses, so the map from
 * `useInlineFormulaValues` applies directly).
 *
 * Writes only to chrome, so it never dirties the field: a following
 * serialization returns byte-identical `(text, marks)`. Offsets are read from
 * the live DOM rather than trusted from the caller, so a value that arrives
 * mid-edit lands on the right token or on none at all.
 */
export interface InlineFormulaTokenPosition {
  element: Element;
  /** The token's offset in the model text — the key its value is stored under. */
  offset: number;
}

/**
 * Every token in the field with its live model offset. Derived from a walk
 * rather than stamped on the element, because an offset stamped at build time
 * goes stale the moment the user types before it.
 */
export function collectInlineFormulaTokens(
  root: HTMLElement
): InlineFormulaTokenPosition[] {
  const tokens: InlineFormulaTokenPosition[] = [];
  let offset = 0;
  walkTextAndBreaks(root, (node, length) => {
    if (isFormulaTokenElement(node)) {
      tokens.push({ element: node as Element, offset });
    }
    offset += length;
    return false;
  });
  return tokens;
}

export function applyInlineFormulaValues(
  root: HTMLElement,
  values: ReadonlyMap<number, string>
): void {
  // Collected first: writing into the tree mid-traversal would move the
  // walker's feet under it.
  for (const { element, offset: at } of collectInlineFormulaTokens(root)) {
    const host = element.querySelector(FORMULA_VALUE_SELECTOR);
    const next = values.get(at) ?? PENDING_FORMULA_VALUE;
    if (host && host.textContent !== next) {
      host.textContent = next;
    }
    // The value may be truncated on screen, so the tooltip carries it in full
    // alongside the expression that produced it.
    const expression = (element as HTMLElement).dataset.expression ?? "";
    const title = values.has(at) ? `${next}\n${expression}` : expression;
    if (element.getAttribute("title") !== title) {
      element.setAttribute("title", title);
    }
  }
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
      if (segment.expression !== undefined) {
        // The sentinel is never written out: the element *is* the character.
        const expression = escapeHtml(segment.expression);
        return `<span data-formula-token="" data-expression="${expression}" data-marks="formula" class="${classForMarks(
          segment.marks
        )}" title="${expression}" contenteditable="false"><span data-inline-formula-chrome="value">${escapeHtml(
          PENDING_FORMULA_VALUE
        )}</span></span>`;
      }
      if (segment.href && segment.pageId) {
        const url = escapeHtml(segment.href);
        const pageId = escapeHtml(segment.pageId);
        const className = (options?.classForPageLink ?? classForMarks)(
          segment.marks
        );
        const styleMarks = pageLinkTitleMarks(segment.marks);
        const titleClassName = escapeHtml(
          styleMarks.length > 0
            ? `${pageTitleUnderlineClassName} ${classForMarks(styleMarks)}`
            : pageTitleUnderlineClassName
        );
        return `<a href="${url}" data-href="${url}" data-page-id="${pageId}" data-marks="${segment.marks.join(
          " "
        )}" class="${className}" contenteditable="false"><span data-inline-page-link-chrome="icon"></span><span class="${titleClassName}">${escapeHtml(
          segment.text
        )}</span><span data-inline-page-link-chrome="arrow"></span></a>`;
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
    } else if (isFormulaTokenElement(node)) {
      text += FORMULA_TOKEN_SENTINEL;
      marks.push({
        type: "formula",
        start,
        end: start + FORMULA_TOKEN_SENTINEL.length,
        expression: (node as HTMLElement).dataset.expression ?? "",
      });
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

/**
 * Page-link anchors are atomic, so an offset that lands on either edge of one
 * must resolve *outside* the anchor — otherwise every caret restore drops the
 * caret back inside the link and the next keystroke extends it.
 */
function escapePageLinkBoundary(position: DomPosition): DomPosition {
  if (position.node.nodeType !== Node.TEXT_NODE) {
    return position;
  }
  const anchor = position.node.parentElement?.closest(
    PAGE_LINK_ANCHOR_SELECTOR
  );
  const parent = anchor?.parentNode;
  if (!(anchor && parent)) {
    return position;
  }
  const atStart = position.offset === 0;
  const atEnd = position.offset >= (position.node.textContent ?? "").length;
  if (!(atStart || atEnd)) {
    return position;
  }
  const index = Array.prototype.indexOf.call(parent.childNodes, anchor);
  return { node: parent, offset: atEnd ? index + 1 : index };
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
    } else {
      const parent = node.parentNode;
      const index = parent
        ? Array.prototype.indexOf.call(parent.childNodes, node)
        : -1;
      if (parent && remaining === 0) {
        // Caret directly before the atomic node (a `<br>` or a token).
        position = { node: parent, offset: index };
        return true;
      }
      if (parent) {
        // …and directly after it, so an offset at the very end of a field that
        // ends in one does not fall back to the text before it.
        lastText = { node: parent, offset: index + 1 };
      }
    }
    remaining -= length;
    return false;
  });

  const resolved = position ?? lastText;
  return resolved
    ? escapePageLinkBoundary(resolved)
    : { node: root, offset: 0 };
}

/**
 * Lifts anything the browser inserted inside a page-link anchor back out to the
 * side it landed on. `contenteditable=false` keeps the caret out of the anchor,
 * but IME, drag-drop, and autocorrect can still drop nodes in — without this the
 * next serialization would stamp the run's `link`/`pageId` marks onto them and
 * the typed text would be swallowed by the link.
 *
 * Node identity is preserved (the nodes are moved, not rebuilt), so a live
 * selection inside them follows along. Returns true when the DOM changed.
 */
export function repairInlinePageLinkDom(root: HTMLElement): boolean {
  let repaired = false;
  for (const anchor of root.querySelectorAll(PAGE_LINK_ANCHOR_SELECTOR)) {
    const parent = anchor.parentNode;
    if (!parent) {
      continue;
    }
    const children = [...anchor.childNodes];
    const title = anchor.querySelector(PAGE_LINK_TITLE_SELECTOR);
    const titleIndex = title ? children.indexOf(title) : -1;
    for (const [index, child] of children.entries()) {
      if (child === title || isInlinePageLinkChrome(child)) {
        continue;
      }
      // Text that landed ahead of the title belongs before the link, not after.
      const beforeTitle = titleIndex >= 0 && index < titleIndex;
      parent.insertBefore(child, beforeTitle ? anchor : anchor.nextSibling);
      repaired = true;
    }
  }
  return repaired;
}

/**
 * The same lift-out for formula tokens, and more load-bearing: a token's whole
 * subtree is excluded from serialization, so anything stranded inside it would
 * be *silently deleted* on the next read rather than merely mis-marked.
 *
 * Returns true when the DOM changed.
 */
export function repairInlineFormulaTokenDom(root: HTMLElement): boolean {
  let repaired = false;
  for (const token of root.querySelectorAll(FORMULA_TOKEN_SELECTOR)) {
    const parent = token.parentNode;
    if (!parent) {
      continue;
    }
    const children = [...token.childNodes];
    const host = token.querySelector(FORMULA_VALUE_SELECTOR);
    const hostIndex = host ? children.indexOf(host) : -1;
    for (const [index, child] of children.entries()) {
      if (child === host) {
        continue;
      }
      const beforeHost = hostIndex >= 0 && index < hostIndex;
      parent.insertBefore(child, beforeHost ? token : token.nextSibling);
      repaired = true;
    }
  }
  return repaired;
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
  const token = elementFor(targetNode)?.closest(FORMULA_TOKEN_SELECTOR);
  if (token?.parentNode && token !== targetNode) {
    // A click landed on the value. There is no offset *within* a token, so
    // resolve to the caret position after it.
    endNode = token.parentNode;
    endOffset =
      Array.prototype.indexOf.call(token.parentNode.childNodes, token) + 1;
  } else if (isInlinePageLinkChrome(targetNode)) {
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
  if (options?.pageId) {
    return createInlinePageLinkAnchor(doc, {
      className: linkClassName,
      href: url,
      markTokens: "link",
      pageId: options.pageId,
      text: options.label ?? url,
    });
  }
  const anchor = doc.createElement("a");
  anchor.setAttribute("href", url);
  anchor.dataset.href = url;
  anchor.dataset.marks = "link";
  anchor.className = linkClassName;
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
