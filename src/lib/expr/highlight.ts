/**
 * Source highlighter for the formula editor. A resilient, never-failing scan of
 * an expression string into a contiguous list of classified {@link ExprSegment}
 * runs (covering every character, including whitespace) that the editable
 * surface renders as colored token spans and property chips.
 *
 * Unlike the real {@link import("./tokenize.ts").tokenize} — which bails on the
 * first lexical error — this always produces segments for whatever is typed so
 * far, so coloring never disappears mid-edit. It is display-only; the parser /
 * evaluator remain the source of truth for meaning.
 */

/** How a run of source is colored. `text`/`punctuation` are the neutral cases. */
export type ExprSegmentClass =
  | "function"
  | "number"
  | "string"
  | "keyword"
  | "operator"
  | "variable"
  | "punctuation"
  | "property"
  | "text";

/** One contiguous, classified run of source. Segments tile `[0, source.length)`. */
export interface ExprSegment {
  className: ExprSegmentClass;
  end: number;
  /** For `property` segments: the referenced field name (dot ident / bracket string). */
  propertyName?: string;
  start: number;
  /** Exact source slice `[start, end)`. */
  text: string;
}

const WHITESPACE_RE = /\s/;
const DIGIT_RE = /[0-9]/;
const IDENTIFIER_START_RE = /[A-Za-z_]/;
const IDENTIFIER_PART_RE = /[A-Za-z0-9_]/;

const SCOPE_ROOTS = new Set(["thispage", "thisrow"]);
const KEYWORD_LITERALS = new Set(["true", "false", "null"]);
const WORD_OPERATORS = new Set(["and", "or", "not"]);
const TWO_CHAR_OPERATORS = ["==", "!=", "<=", ">=", "&&", "||"];
const SINGLE_CHAR_OPERATORS = new Set(["+", "-", "*", "/", "%", "<", ">", "!"]);
const PUNCTUATION = new Set(["(", ")", ",", ".", "[", "]"]);

/** Advance past a run of characters matching `test`, returning the end index. */
function consumeWhile(
  source: string,
  start: number,
  test: (char: string) => boolean
): number {
  let index = start;
  while (index < source.length && test(source[index])) {
    index += 1;
  }
  return index;
}

/** End index of a number literal starting at `start` (digits, optional .digits). */
function scanNumberEnd(source: string, start: number): number {
  let index = consumeWhile(source, start, (char) => DIGIT_RE.test(char));
  if (
    source[index] === "." &&
    index + 1 < source.length &&
    DIGIT_RE.test(source[index + 1])
  ) {
    index = consumeWhile(source, index + 1, (char) => DIGIT_RE.test(char));
  }
  return index;
}

/**
 * End index (exclusive) of a string literal opened at `start`. Stops after the
 * matching quote, or at end-of-input for an unterminated string (still colored
 * as a string so an in-progress `"dra` reads as one).
 */
function scanStringEnd(source: string, start: number): number {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === quote) {
      return index + 1;
    }
    index += 1;
  }
  return index;
}

/** Skip whitespace, returning the next non-space index. */
function skipWhitespace(source: string, start: number): number {
  return consumeWhile(source, start, (char) => WHITESPACE_RE.test(char));
}

interface PropertyAccess {
  /** Exclusive end of the whole `thisPage.X` / `thisPage["X"]` run. */
  end: number;
  name: string;
}

/**
 * Given the index just past a `thisPage`/`thisRow` root, try to consume a
 * `.field` or `["field"]` access. Returns the run's end + the field name, or
 * `null` when there is no complete access yet (mid-edit).
 */
function scanPropertyAccess(
  source: string,
  afterRoot: number
): PropertyAccess | null {
  const dotStart = skipWhitespace(source, afterRoot);
  if (source[dotStart] === ".") {
    const nameStart = skipWhitespace(source, dotStart + 1);
    if (
      nameStart < source.length &&
      IDENTIFIER_START_RE.test(source[nameStart])
    ) {
      const nameEnd = consumeWhile(source, nameStart + 1, (char) =>
        IDENTIFIER_PART_RE.test(char)
      );
      return { end: nameEnd, name: source.slice(nameStart, nameEnd) };
    }
    return null;
  }
  if (source[dotStart] === "[") {
    const quoteStart = skipWhitespace(source, dotStart + 1);
    const quote = source[quoteStart];
    if (quote !== '"' && quote !== "'") {
      return null;
    }
    const stringEnd = scanStringEnd(source, quoteStart);
    // Require the closing quote to actually be present before the bracket.
    if (source[stringEnd - 1] !== quote || stringEnd <= quoteStart + 1) {
      return null;
    }
    const bracketEnd = skipWhitespace(source, stringEnd);
    if (source[bracketEnd] !== "]") {
      return null;
    }
    const name = source.slice(quoteStart + 1, stringEnd - 1);
    return { end: bracketEnd + 1, name };
  }
  return null;
}

/** Classify a bare identifier (already known not to be a scope-root property). */
function classifyIdentifier(
  source: string,
  value: string,
  end: number
): ExprSegmentClass {
  const lower = value.toLowerCase();
  if (KEYWORD_LITERALS.has(lower)) {
    return "keyword";
  }
  if (WORD_OPERATORS.has(lower)) {
    return "operator";
  }
  // A function is an identifier directly followed by `(`.
  return source[skipWhitespace(source, end)] === "(" ? "function" : "variable";
}

function push(
  segments: ExprSegment[],
  source: string,
  start: number,
  end: number,
  className: ExprSegmentClass,
  propertyName?: string
): void {
  segments.push({
    className,
    start,
    end,
    text: source.slice(start, end),
    ...(propertyName === undefined ? {} : { propertyName }),
  });
}

interface ScanStep {
  className: ExprSegmentClass;
  end: number;
  propertyName?: string;
}

/** Read the identifier at `index`, coalescing a `thisPage.X` property run. */
function readIdentifier(source: string, index: number): ScanStep {
  const end = consumeWhile(source, index + 1, (char) =>
    IDENTIFIER_PART_RE.test(char)
  );
  const value = source.slice(index, end);
  if (SCOPE_ROOTS.has(value.toLowerCase())) {
    const access = scanPropertyAccess(source, end);
    if (access) {
      return {
        className: "property",
        end: access.end,
        propertyName: access.name,
      };
    }
  }
  return { className: classifyIdentifier(source, value, end), end };
}

/** Read exactly one segment starting at `index`. */
function readSegment(source: string, index: number): ScanStep {
  const char = source[index];
  if (WHITESPACE_RE.test(char)) {
    return {
      className: "text",
      end: consumeWhile(source, index, (c) => WHITESPACE_RE.test(c)),
    };
  }
  if (DIGIT_RE.test(char)) {
    return { className: "number", end: scanNumberEnd(source, index) };
  }
  if (char === '"' || char === "'") {
    return { className: "string", end: scanStringEnd(source, index) };
  }
  if (IDENTIFIER_START_RE.test(char)) {
    return readIdentifier(source, index);
  }
  const twoChar = TWO_CHAR_OPERATORS.find((op) => source.startsWith(op, index));
  if (twoChar) {
    return { className: "operator", end: index + twoChar.length };
  }
  if (SINGLE_CHAR_OPERATORS.has(char)) {
    return { className: "operator", end: index + 1 };
  }
  return {
    className: PUNCTUATION.has(char) ? "punctuation" : "text",
    end: index + 1,
  };
}

/**
 * Scan `source` into classified, contiguous segments for display. Never throws
 * and always tiles the whole string, so it is safe to call on every keystroke.
 */
export function scanExpressionSegments(source: string): ExprSegment[] {
  const segments: ExprSegment[] = [];
  let index = 0;
  while (index < source.length) {
    const step = readSegment(source, index);
    push(segments, source, index, step.end, step.className, step.propertyName);
    index = step.end;
  }
  return segments;
}
