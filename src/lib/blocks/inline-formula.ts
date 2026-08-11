import {
  normalizeInlineMarks,
  sliceInlineMarks,
} from "@/lib/blocks/rich-text.ts";
import {
  FORMULA_TOKEN_SENTINEL,
  type InlineMark,
} from "@/lib/schemas/rich-text.ts";

/**
 * The plain-text projection for inline formula tokens.
 *
 * A token occupies exactly one {@link FORMULA_TOKEN_SENTINEL} character in
 * `props.text`; its rendered value is chrome, never document text. That is what
 * makes re-evaluation free of offset shifts — but it also means the canonical
 * plain string is no longer "what the reader sees". Every read site that shows
 * text to a human or an index (word count, search, plain-text clipboard,
 * markdown export, OG descriptions) runs it through
 * {@link projectPlainText} first.
 *
 * Pure and total: an unknown token projects to its fallback rather than
 * throwing or leaking a sentinel, so a missing value can never surface as a
 * stray `￼`.
 */

/** What an unresolved token renders as — visible, not silent. */
const UNRESOLVED_PLACEHOLDER = "…";

export interface ProjectPlainTextOptions {
  /** Stand-in for a token with no value yet. Defaults to a single ellipsis. */
  readonly fallback?: string;
  /**
   * Rendered value per token, keyed by the mark's `start` offset (unique: each
   * token owns one character). Absent entries use {@link fallback}.
   */
  readonly values?: ReadonlyMap<number, string>;
}

/** Whether `mark` is a formula token (and therefore covers one sentinel). */
export function isFormulaTokenMark(mark: InlineMark): boolean {
  return mark.type === "formula";
}

/**
 * `text` with every formula token's sentinel replaced by its rendered value.
 *
 * Replacement runs right-to-left so earlier offsets stay valid while later ones
 * are spliced — the same discipline the reference rewriters use. Marks are not
 * returned: this projection is for read-only consumers, and a caller that needs
 * positions in the projected string should not be using it.
 */
export function projectPlainText(
  text: string,
  marks: readonly InlineMark[],
  options?: ProjectPlainTextOptions
): string {
  const tokens = marks.filter(isFormulaTokenMark);
  if (tokens.length === 0) {
    return text;
  }
  const fallback = options?.fallback ?? UNRESOLVED_PLACEHOLDER;
  let projected = text;
  for (const token of [...tokens].sort((a, b) => b.start - a.start)) {
    // Defensive: only splice where a sentinel actually sits, so a stale mark
    // can never eat a real character.
    if (projected.slice(token.start, token.end) !== FORMULA_TOKEN_SENTINEL) {
      continue;
    }
    const value = options?.values?.get(token.start) ?? fallback;
    projected =
      projected.slice(0, token.start) + value + projected.slice(token.end);
  }
  return projected;
}

/**
 * Whether `text` still holds a sentinel — the assertion a read site can make in
 * tests to prove it projected. Cheap enough to call in a dev-only guard.
 */
export function hasUnprojectedToken(text: string): boolean {
  return text.includes(FORMULA_TOKEN_SENTINEL);
}

/** A formula token mark over the sentinel inserted at `offset`. */
export function formulaTokenMark(
  offset: number,
  expression: string
): InlineMark {
  return {
    type: "formula",
    start: offset,
    end: offset + FORMULA_TOKEN_SENTINEL.length,
    expression,
  };
}

interface TextRange {
  end: number;
  start: number;
}

export interface FormulaTokenEdit {
  marks: InlineMark[];
  /** Caret placement after the edit — collapsed just past the token. */
  selection: TextRange;
  text: string;
}

/**
 * `(text, marks)` with a token replacing `range`.
 *
 * Composed from `sliceInlineMarks`/`normalizeInlineMarks` rather than doing
 * offset arithmetic in place, so the surrounding marks are rebased by the same
 * code paste and row-splitting already use — including the clipping that keeps
 * a styling mark from covering half of an atomic run.
 */
export function insertFormulaToken(
  text: string,
  marks: readonly InlineMark[],
  range: TextRange,
  expression: string
): FormulaTokenEdit {
  const start = Math.max(0, Math.min(range.start, text.length));
  const end = Math.max(start, Math.min(range.end, text.length));
  const nextText =
    text.slice(0, start) + FORMULA_TOKEN_SENTINEL + text.slice(end);
  const after = start + FORMULA_TOKEN_SENTINEL.length;
  const tail = sliceInlineMarks(marks, end, text.length).map((mark) => ({
    ...mark,
    start: mark.start + after,
    end: mark.end + after,
  }));
  return {
    text: nextText,
    marks: normalizeInlineMarks(
      [
        ...sliceInlineMarks(marks, 0, start),
        formulaTokenMark(start, expression),
        ...tail,
      ],
      nextText.length
    ),
    selection: { start: after, end: after },
  };
}

/** The token covering `offset`, or null — the lookup behind click-to-edit. */
export function formulaTokenAt(
  marks: readonly InlineMark[],
  offset: number
): InlineMark | null {
  return (
    marks.find(
      (mark) =>
        isFormulaTokenMark(mark) && mark.start <= offset && offset < mark.end
    ) ?? null
  );
}

/**
 * A token's expression rewritten in place. Text is untouched: the sentinel is
 * one character whatever the expression says, which is the whole point of the
 * design — editing a formula can never shift a single offset in the document.
 */
export function setFormulaTokenExpression(
  marks: readonly InlineMark[],
  offset: number,
  expression: string
): InlineMark[] {
  return marks.map((mark) =>
    isFormulaTokenMark(mark) && mark.start === offset
      ? { ...mark, expression }
      : mark
  );
}
