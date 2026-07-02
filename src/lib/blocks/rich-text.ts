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
      ...(mark.href === undefined ? {} : { href: mark.href }),
    }))
    .filter((mark) => mark.start < mark.end)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: InlineMark[] = [];
  for (const mark of clamped) {
    let previous: InlineMark | undefined;
    for (let i = merged.length - 1; i >= 0; i -= 1) {
      // Links only merge with an adjoining link of the *same* href — two
      // different destinations must stay distinct runs.
      if (merged[i]?.type === mark.type && merged[i]?.href === mark.href) {
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
        ...(mark.href === undefined ? {} : { href: mark.href }),
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
        ...(mark.href === undefined ? {} : { href: mark.href }),
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
  const carryHref = (mark: InlineMark) =>
    mark.href === undefined ? {} : { href: mark.href };
  for (const mark of marks) {
    if (mark.type !== type || mark.end <= start || mark.start >= end) {
      next.push(mark);
      continue;
    }
    if (mark.start < start) {
      next.push({ type, start: mark.start, end: start, ...carryHref(mark) });
    }
    if (mark.end > end) {
      next.push({ type, start: end, end: mark.end, ...carryHref(mark) });
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

/**
 * Apply a link over `[start, end)`, replacing any link already covering the
 * range (a range carries at most one destination).
 */
export function setLinkInRange(
  marks: readonly InlineMark[],
  start: number,
  end: number,
  href: string,
  textLength: number
): InlineMark[] {
  if (start >= end) {
    return normalizeInlineMarks(marks, textLength);
  }
  const cleared = removeMarkFromRange(marks, "link", start, end, textLength);
  return normalizeInlineMarks(
    [...cleared, { type: "link", start, end, href }],
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
    (mark) =>
      mark.type === "link" && mark.start <= start && mark.end >= end
  )?.href;
}

const URL_PATTERN = /^https?:\/\/\S+$/i;

/** True for a bare http(s) URL — the paste-to-link trigger. */
export function isLikelyUrl(text: string): boolean {
  return URL_PATTERN.test(text.trim());
}

export interface RichTextSegment {
  /** Destination when a `link` mark covers the segment. */
  href?: string;
  marks: InlineMarkType[];
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
      (mark) =>
        mark.type === "link" && mark.start <= start && mark.end >= end
    );
    segments.push({
      text: text.slice(start, end),
      marks: segmentMarks,
      ...(linkMark?.href === undefined ? {} : { href: linkMark.href }),
    });
  }
  return segments;
}

/**
 * True when the block's type supports inline marks on its primary text.
 * Headings carry no formatting (no marks, no color) — they stay structural.
 */
export function blockSupportsInlineMarks(block: Block): boolean {
  return (
    Boolean(getBlockDef(block.type).hasPrimaryText) &&
    block.type !== "code" &&
    block.type !== "heading" &&
    block.type !== "toggleHeading"
  );
}

export function getBlockMarks(block: Block): InlineMark[] {
  if (!blockSupportsInlineMarks(block)) {
    return [];
  }
  return (block.props as { marks?: InlineMark[] }).marks ?? [];
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
  if (!blockSupportsInlineMarks(block)) {
    return { ...block, props: { ...block.props, text } };
  }
  const normalized = normalizeInlineMarks(marks, text.length);
  return {
    ...block,
    props: {
      ...block.props,
      text,
      marks: normalized.length > 0 ? normalized : undefined,
    },
  };
}
