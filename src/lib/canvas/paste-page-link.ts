import {
  createPageLinkBlock,
  getTextFromBlock,
} from "@/lib/blocks/create-block.ts";
import {
  blockSupportsLinkMarks,
  concatInlineMarks,
  getBlockMarks,
  setLinkInRange,
  sliceInlineMarks,
} from "@/lib/blocks/rich-text.ts";
import type { Block, BlockType } from "@/lib/schemas/block.ts";
import type { InlineMark } from "@/lib/schemas/rich-text.ts";

/**
 * How a same-origin page URL paste should land on `block`:
 * - `convert` — empty text-capable leaf → in-place `slash.convert` to pageLink
 * - `inline` — block already has text → insert an inline page-link mark
 * - `insert` — paste a pageLink after the row (blocks with no primary text)
 * - `skip` — leave the event to inline-link / plain paste (code, table cells)
 */
export type PageLinkPastePlacement = "convert" | "inline" | "insert" | "skip";

function isConvertibleEmptyLeaf(type: BlockType): boolean {
  switch (type) {
    case "text":
    case "heading":
    case "quote":
    case "checklistItem":
      return true;
    case "toggleHeading":
    case "callout":
    case "code":
    case "pageLink":
    case "divider":
    case "columns":
    case "column":
    case "tabs":
    case "tab":
    case "media":
    case "embed":
    case "database":
    case "table":
    case "tableRow":
    case "tableCell":
    case "list":
    case "checklist":
      return false;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

function isPageLinkPasteSkipped(type: BlockType): boolean {
  switch (type) {
    case "code":
    case "tableCell":
    case "tableRow":
    case "table":
      return true;
    case "text":
    case "heading":
    case "toggleHeading":
    case "quote":
    case "callout":
    case "checklistItem":
    case "pageLink":
    case "divider":
    case "columns":
    case "column":
    case "tabs":
    case "tab":
    case "media":
    case "embed":
    case "database":
    case "list":
    case "checklist":
      return false;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/**
 * Decides convert-in-place vs inline page-link mark vs insert-after vs skip for
 * an internal page URL paste targeting `block`. Empty text/heading/quote/
 * checklist items convert to a `pageLink` block; any block whose primary text
 * already has content takes an inline page link (headings included); code and
 * table structure skip so plain paste runs. `insert` is only for blocks with no
 * link-capable primary text (media, embed, divider, database, containers).
 */
export function resolvePageLinkPastePlacement(
  block: Block
): PageLinkPastePlacement {
  if (isPageLinkPasteSkipped(block.type)) {
    return "skip";
  }
  if (
    isConvertibleEmptyLeaf(block.type) &&
    getTextFromBlock(block).trim().length === 0
  ) {
    return "convert";
  }
  if (
    blockSupportsLinkMarks(block) &&
    getTextFromBlock(block).trim().length > 0
  ) {
    return "inline";
  }
  return "insert";
}

/** Builds a `pageLink` block for paste (linked variant, matching Link To Page). */
export function buildPastedPageLinkBlock(pageId: string): Block {
  return {
    ...createPageLinkBlock(pageId),
    props: { pageId, variant: "linked" },
  };
}

export interface InlinePageLinkInsertion {
  /** Caret offset just after the inserted page-link run. */
  caret: number;
  marks: InlineMark[];
  text: string;
}

export interface InlinePageLinkInput {
  /** Absolute page URL stored on the mark. */
  href: string;
  pageId: string;
  /**
   * Character range to replace. Omitted (or null) means "no live caret" —
   * the link is appended at the end of the text.
   */
  selection?: { end: number; start: number } | null;
  /** Page title used as the run's label text. */
  title: string;
}

const TRAILING_WHITESPACE_RE = /\s$/;

/**
 * Plans an inline page-link insertion into a block's `(text, marks)` model:
 * replaces `selection` with the page title and links that run to `pageId`.
 * Without a selection the link is appended at the end (space-separated), so a
 * paste with no live caret still lands inline instead of creating a new row.
 */
export function planInlinePageLinkInsertion(
  block: Block,
  input: InlinePageLinkInput
): InlinePageLinkInsertion | null {
  if (!blockSupportsLinkMarks(block)) {
    return null;
  }

  const text = getTextFromBlock(block);
  const marks = getBlockMarks(block);
  const selection = input.selection ?? null;
  const start = selection
    ? Math.max(0, Math.min(selection.start, text.length))
    : text.length;
  const end = selection
    ? Math.max(start, Math.min(selection.end, text.length))
    : text.length;

  const needsLeadingSpace =
    !selection && start > 0 && !TRAILING_WHITESPACE_RE.test(text);
  const label = `${needsLeadingSpace ? " " : ""}${input.title}`;
  const linkStart = start + (needsLeadingSpace ? 1 : 0);
  const nextText = text.slice(0, start) + label + text.slice(end);

  const head = concatInlineMarks(
    sliceInlineMarks(marks, 0, start),
    start + label.length,
    sliceInlineMarks(marks, end, text.length),
    nextText.length
  );

  return {
    caret: start + label.length,
    marks: setLinkInRange(
      head,
      linkStart,
      start + label.length,
      input.href,
      nextText.length,
      { pageId: input.pageId }
    ),
    text: nextText,
  };
}
