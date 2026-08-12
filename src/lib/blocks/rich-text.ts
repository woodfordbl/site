import { getBlockDef } from "@/lib/blocks/block-defs.ts";
import type { Block } from "@/lib/schemas/block.ts";
import type { InlineMark, InlineMarkType } from "@/lib/schemas/rich-text.ts";
import { inlineMarkTypeSchema } from "@/lib/schemas/rich-text.ts";

/**
 * Pure operations over inline marks (half-open `[start, end)` ranges into a
 * block's primary text). Everything here preserves the invariant enforced by
 * `normalizeInlineMarks`: sorted by start, clamped to the text, no empty
 * ranges, and no overlapping/adjacent ranges of the same type.
 */

export const INLINE_MARK_TYPES = inlineMarkTypeSchema.options;

/** Optional link destination fields carried on `link` marks. */
export function linkMarkExtras(
  mark: Pick<InlineMark, "expression" | "href" | "pageId">
): Pick<InlineMark, "expression" | "href" | "pageId"> {
  return {
    ...(mark.href === undefined ? {} : { href: mark.href }),
    ...(mark.pageId === undefined ? {} : { pageId: mark.pageId }),
    ...(mark.expression === undefined ? {} : { expression: mark.expression }),
  };
}

/**
 * Identity for merging two adjacent same-type marks: links only merge with an
 * adjoining link of the same destination. Formula tokens never merge at all
 * (see {@link normalizeInlineMarks}), so `expression` is compared here only for
 * completeness.
 */
function linksMatch(a: InlineMark, b: InlineMark): boolean {
  return (
    a.href === b.href && a.pageId === b.pageId && a.expression === b.expression
  );
}

/**
 * Runs that behave as one indivisible unit: inline page links and formula
 * tokens. A styling mark either covers a whole run or stops at its edges, so
 * bolding across one can never split it into two chrome-bearing halves.
 */
function isAtomicRunMark(mark: InlineMark): boolean {
  return (
    (mark.type === "link" && mark.pageId !== undefined) ||
    mark.type === "formula"
  );
}

interface MarkRange {
  end: number;
  start: number;
}

function subtractRange(piece: MarkRange, cut: MarkRange): MarkRange[] {
  if (cut.end <= piece.start || cut.start >= piece.end) {
    return [piece];
  }
  const rest: MarkRange[] = [];
  if (piece.start < cut.start) {
    rest.push({ start: piece.start, end: cut.start });
  }
  if (piece.end > cut.end) {
    rest.push({ start: cut.end, end: piece.end });
  }
  return rest;
}

/**
 * Clip a styling mark to the atomic runs it overlaps (see
 * {@link isAtomicRunMark}). Partial coverage is dropped, so an atomic run never
 * splits when the user bolds across it. Atomic marks themselves pass through —
 * they define the runs rather than being clipped by them.
 */
function clipToPageLinkRuns(
  mark: InlineMark,
  runs: readonly MarkRange[]
): InlineMark[] {
  if (mark.type === "link" || mark.type === "formula") {
    return [mark];
  }
  let pieces: MarkRange[] = [{ start: mark.start, end: mark.end }];
  for (const run of runs) {
    if (mark.start <= run.start && mark.end >= run.end) {
      continue;
    }
    pieces = pieces.flatMap((piece) => subtractRange(piece, run));
  }
  return pieces.map((piece) => ({
    type: mark.type,
    start: piece.start,
    end: piece.end,
  }));
}

/** Sort, clamp to `textLength`, drop empties, merge same-type overlaps. */
export function normalizeInlineMarks(
  marks: readonly InlineMark[],
  textLength: number
): InlineMark[] {
  const clamped = marks
    .map((mark) => ({
      type: mark.type,
      start: Math.max(0, Math.min(mark.start, textLength)),
      end: Math.max(0, Math.min(mark.end, textLength)),
      ...linkMarkExtras(mark),
    }))
    .filter((mark) => mark.start < mark.end)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const pageLinkRuns = clamped
    .filter(isAtomicRunMark)
    .map((mark) => ({ start: mark.start, end: mark.end }));
  const clipped = (
    pageLinkRuns.length === 0
      ? clamped
      : clamped.flatMap((mark) => clipToPageLinkRuns(mark, pageLinkRuns))
  ).sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: InlineMark[] = [];
  for (const mark of clipped) {
    if (mark.type === "formula") {
      // Each token is exactly one sentinel, so two adjacent tokens are two
      // tokens — never one two-character run, even when their expressions
      // match. A merged run would cover two sentinels and project neither.
      merged.push({ ...mark });
      continue;
    }
    let previous: InlineMark | undefined;
    for (let i = merged.length - 1; i >= 0; i -= 1) {
      // Links merge only with an adjoining link of the same destination, and
      // formula tokens only with an identical expression (see linksMatch).
      if (merged[i]?.type === mark.type && linksMatch(merged[i], mark)) {
        previous = merged[i];
        break;
      }
    }
    if (previous && mark.start <= previous.end) {
      previous.end = Math.max(previous.end, mark.end);
    } else {
      merged.push({ ...mark });
    }
  }
  return merged;
}

/** Marks clipped to `[start, end)` and rebased to 0 (row split, copy). */
export function sliceInlineMarks(
  marks: readonly InlineMark[],
  start: number,
  end: number
): InlineMark[] {
  return normalizeInlineMarks(
    marks
      .filter((mark) => mark.end > start && mark.start < end)
      .map((mark) => ({
        type: mark.type,
        start: Math.max(mark.start, start) - start,
        end: Math.min(mark.end, end) - start,
        ...linkMarkExtras(mark),
      })),
    end - start
  );
}

/** Marks for `a + b` where `b`'s ranges shift by `aLength` (row merge). */
export function concatInlineMarks(
  a: readonly InlineMark[],
  aLength: number,
  b: readonly InlineMark[],
  totalLength: number
): InlineMark[] {
  return normalizeInlineMarks(
    [
      ...a,
      ...b.map((mark) => ({
        type: mark.type,
        start: mark.start + aLength,
        end: mark.end + aLength,
        ...linkMarkExtras(mark),
      })),
    ],
    totalLength
  );
}

/** True when every character in `[start, end)` carries the mark type. */
export function isMarkActive(
  marks: readonly InlineMark[],
  type: InlineMarkType,
  start: number,
  end: number
): boolean {
  if (start >= end) {
    // Collapsed selection: active when the caret sits strictly inside a range
    // (typing there would inherit the mark).
    return marks.some(
      (mark) => mark.type === type && mark.start < start && start < mark.end
    );
  }

  let covered = start;
  for (const mark of marks) {
    if (mark.type !== type || mark.end <= covered) {
      continue;
    }
    if (mark.start > covered) {
      return false;
    }
    covered = mark.end;
    if (covered >= end) {
      return true;
    }
  }
  return covered >= end;
}

/** Remove the mark type from `[start, end)`, splitting straddling ranges. */
export function removeMarkFromRange(
  marks: readonly InlineMark[],
  type: InlineMarkType,
  start: number,
  end: number,
  textLength: number
): InlineMark[] {
  const next: InlineMark[] = [];
  for (const mark of marks) {
    if (mark.type !== type || mark.end <= start || mark.start >= end) {
      next.push(mark);
      continue;
    }
    if (mark.start < start) {
      next.push({
        type,
        start: mark.start,
        end: start,
        ...linkMarkExtras(mark),
      });
    }
    if (mark.end > end) {
      next.push({ type, start: end, end: mark.end, ...linkMarkExtras(mark) });
    }
  }
  return normalizeInlineMarks(next, textLength);
}

/**
 * Notion-style toggle: if the whole range already carries the mark, remove it
 * from the range; otherwise extend the mark across the range.
 */
export function toggleMarkInRange(
  marks: readonly InlineMark[],
  type: InlineMarkType,
  start: number,
  end: number,
  textLength: number
): InlineMark[] {
  if (start >= end) {
    return normalizeInlineMarks(marks, textLength);
  }
  if (isMarkActive(marks, type, start, end)) {
    return removeMarkFromRange(marks, type, start, end, textLength);
  }
  return normalizeInlineMarks([...marks, { type, start, end }], textLength);
}

export interface SetLinkInRangeOptions {
  /** Workspace page id — renders as an inline page link (icon + title + arrow). */
  pageId?: string;
}

/**
 * Apply a link over `[start, end)`, replacing any link already covering the
 * range (a range carries at most one destination). Pass `pageId` for an inline
 * page link rather than a plain URL mark.
 */
export function setLinkInRange(
  marks: readonly InlineMark[],
  start: number,
  end: number,
  href: string,
  textLength: number,
  options?: SetLinkInRangeOptions
): InlineMark[] {
  if (start >= end) {
    return normalizeInlineMarks(marks, textLength);
  }
  const cleared = removeMarkFromRange(marks, "link", start, end, textLength);
  return normalizeInlineMarks(
    [
      ...cleared,
      {
        type: "link",
        start,
        end,
        href,
        ...(options?.pageId === undefined ? {} : { pageId: options.pageId }),
      },
    ],
    textLength
  );
}

/** Strip any link marks from `[start, end)` (unlink). */
export function removeLinkInRange(
  marks: readonly InlineMark[],
  start: number,
  end: number,
  textLength: number
): InlineMark[] {
  return removeMarkFromRange(marks, "link", start, end, textLength);
}

/** The href of a link covering the whole `[start, end)` range, if any. */
export function getLinkHrefInRange(
  marks: readonly InlineMark[],
  start: number,
  end: number
): string | undefined {
  return marks.find(
    (mark) => mark.type === "link" && mark.start <= start && mark.end >= end
  )?.href;
}

const URL_PATTERN = /^https?:\/\/\S+$/i;

/**
 * True for a bare http(s) URL — the paste-to-link trigger (lone URL → linked
 * text; URL over a selection → wrap selection as a link).
 */
export function isLikelyUrl(text: string): boolean {
  return URL_PATTERN.test(text.trim());
}

export interface RichTextSegment {
  /**
   * Formula source when a `formula` mark covers the segment — an inline token,
   * whose `text` is the sentinel rather than anything a reader should see.
   */
  expression?: string;
  /** Destination when a `link` mark covers the segment. */
  href?: string;
  marks: InlineMarkType[];
  /** Workspace page id when the link mark is an inline page link. */
  pageId?: string;
  text: string;
}

/** Split text at mark boundaries into contiguous equally-marked segments. */
export function segmentRichText(
  text: string,
  marks: readonly InlineMark[] | undefined
): RichTextSegment[] {
  const normalized = normalizeInlineMarks(marks ?? [], text.length);
  if (normalized.length === 0) {
    return text ? [{ text, marks: [] }] : [];
  }

  const boundaries = new Set<number>([0, text.length]);
  for (const mark of normalized) {
    boundaries.add(mark.start);
    boundaries.add(mark.end);
  }
  const sorted = [...boundaries].sort((a, b) => a - b);

  const segments: RichTextSegment[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (start === undefined || end === undefined || start >= end) {
      continue;
    }
    const segmentMarks = INLINE_MARK_TYPES.filter((type) =>
      normalized.some(
        (mark) => mark.type === type && mark.start <= start && mark.end >= end
      )
    );
    const linkMark = normalized.find(
      (mark) => mark.type === "link" && mark.start <= start && mark.end >= end
    );
    const formulaMark = normalized.find(
      (mark) =>
        mark.type === "formula" && mark.start <= start && mark.end >= end
    );
    segments.push({
      text: text.slice(start, end),
      marks: segmentMarks,
      ...(linkMark?.href === undefined ? {} : { href: linkMark.href }),
      ...(linkMark?.pageId === undefined ? {} : { pageId: linkMark.pageId }),
      ...(formulaMark?.expression === undefined
        ? {}
        : { expression: formulaMark.expression }),
    });
  }
  return segments;
}

/**
 * True when the block's primary text can carry `link` marks — including page
 * links pasted into a heading. Code blocks keep their text literal.
 */
export function blockSupportsLinkMarks(block: Block): boolean {
  return (
    Boolean(getBlockDef(block.type).hasPrimaryText) && block.type !== "code"
  );
}

/**
 * True when the block's type supports the styling marks (bold, italic, …).
 * Headings carry no formatting (no styling marks, no color) — they stay
 * structural, but they may still hold link marks.
 */
export function blockSupportsInlineMarks(block: Block): boolean {
  return (
    blockSupportsLinkMarks(block) &&
    block.type !== "heading" &&
    block.type !== "toggleHeading"
  );
}

function allowedMarksForBlock(
  block: Block,
  marks: readonly InlineMark[]
): readonly InlineMark[] {
  if (blockSupportsInlineMarks(block)) {
    return marks;
  }
  return marks.filter((mark) => mark.type === "link");
}

export function getBlockMarks(block: Block): InlineMark[] {
  if (!blockSupportsLinkMarks(block)) {
    return [];
  }
  const marks = (block.props as { marks?: InlineMark[] }).marks ?? [];
  return [...allowedMarksForBlock(block, marks)];
}

/** Replace text and marks together (marks dropped for unsupported types). */
export function withBlockRichText<T extends Block>(
  block: T,
  text: string,
  marks: readonly InlineMark[]
): T {
  if (!getBlockDef(block.type).hasPrimaryText) {
    return block;
  }
  if (!blockSupportsLinkMarks(block)) {
    return { ...block, props: { ...block.props, text } };
  }
  const normalized = normalizeInlineMarks(
    allowedMarksForBlock(block, marks),
    text.length
  );
  return {
    ...block,
    props: {
      ...block.props,
      text,
      marks: normalized.length > 0 ? normalized : undefined,
    },
  };
}
