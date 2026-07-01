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
    }))
    .filter((mark) => mark.start < mark.end)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: InlineMark[] = [];
  for (const mark of clamped) {
    let previous: InlineMark | undefined;
    for (let i = merged.length - 1; i >= 0; i -= 1) {
      if (merged[i]?.type === mark.type) {
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
      next.push({ type, start: mark.start, end: start });
    }
    if (mark.end > end) {
      next.push({ type, start: end, end: mark.end });
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

export interface RichTextSegment {
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
    segments.push({ text: text.slice(start, end), marks: segmentMarks });
  }
  return segments;
}

/** True when the block's type supports inline marks on its primary text. */
export function blockSupportsInlineMarks(block: Block): boolean {
  return (
    Boolean(getBlockDef(block.type).hasPrimaryText) && block.type !== "code"
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
