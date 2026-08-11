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
