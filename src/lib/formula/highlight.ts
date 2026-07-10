/**
 * Syntax classification for the formula editor (`lib/formula`). Pure and
 * React-free: maps a formula source string to non-overlapping, sorted
 * highlight spans by running the real tokenizer ({@link tokenizeFormula}) —
 * the single grammar truth — so editor colors can never drift from what the
 * parser accepts. Token-level only (no parse): classification follows the
 * same lookahead rules the parser uses (scope roots, `prop("…")`, call
 * syntax, word operators), and unparseable-but-lexable drafts still
 * highlight, which is the common state mid-keystroke.
 */

import { FORMULA_PROP_ROOT, FORMULA_SCOPE_ROOTS } from "@/lib/formula/parse.ts";
import {
  type FormulaPunct,
  type FormulaToken,
  tokenizeFormula,
} from "@/lib/formula/tokenize.ts";

/**
 * Highlight categories, mirroring the proposal's restrained palette:
 * `function`/`operator` render in the plain foreground, literals in muted
 * block colors, `property` marks a whole reference (`thisPage.X`,
 * `prop("…")`, bare member names), `name` covers let/lambda identifiers.
 */
export type FormulaHighlightKind =
  | "comment"
  | "function"
  | "literal"
  | "name"
  | "number"
  | "operator"
  | "property"
  | "string";

/** One classified source span; `start` inclusive, `end` exclusive. */
export interface FormulaHighlightSpan {
  end: number;
  kind: FormulaHighlightKind;
  start: number;
}

/**
 * One canonical `prop("<id>")` reference span; `id` is the unescaped string
 * argument (the raw field id). `start` inclusive, `end` exclusive.
 */
export interface FormulaPropIdSpan {
  end: number;
  id: string;
  start: number;
}

/** Word operators (`and`/`or`/`not`), matched case-insensitively like the parser. */
const WORD_OPERATORS = new Set(["and", "or", "not"]);

/** Keyword literals (`true`/`false`/`null`), matched case-insensitively. */
const WORD_LITERALS = new Set(["true", "false", "null"]);

/** Puncts that read as operators; grouping/list puncts stay unstyled. */
const OPERATOR_PUNCTS = new Set<FormulaPunct>([
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "??",
  "=>",
  "+",
  "-",
  "*",
  "/",
  "%",
  "^",
  "<",
  ">",
  "!",
  ".",
]);

const WHITESPACE_RE = /\s/;

function isPunct(token: FormulaToken | undefined, value: FormulaPunct) {
  return token?.type === "punct" && token.value === value;
}

/**
 * Comment spans reconstructed from inter-token gaps: the tokenizer skips
 * only whitespace and comments, so any non-whitespace character between two
 * tokens is guaranteed to start a `//` or a slash-star comment — a tiny scan
 * recovers each comment's extent without re-implementing string handling.
 */
function commentSpans(
  source: string,
  tokens: readonly FormulaToken[]
): FormulaHighlightSpan[] {
  const spans: FormulaHighlightSpan[] = [];
  let cursor = 0;
  for (const token of tokens) {
    let index = cursor;
    while (index < token.position) {
      if (WHITESPACE_RE.test(source[index])) {
        index += 1;
        continue;
      }
      const end = commentEnd(source, index, token.position);
      spans.push({ start: index, end, kind: "comment" });
      index = end;
    }
    cursor = token.end;
  }
  return spans;
}

/** End (exclusive) of the comment starting at `start`, clamped to `limit`. */
function commentEnd(source: string, start: number, limit: number): number {
  if (source.startsWith("//", start)) {
    const newline = source.indexOf("\n", start + 2);
    return newline === -1 || newline >= limit ? limit : newline;
  }
  const close = source.indexOf("*/", start + 2);
  return close === -1 || close + 2 > limit ? limit : close + 2;
}

/**
 * Classify a scope reference starting at `thisPage`/`thisRow`: one property
 * span covering the root plus its immediate `.name` or `["name"]` hop (the
 * hop is the reference; deeper members are ordinary member access). Returns
 * the next unconsumed token index.
 */
function classifyScopeReference(
  tokens: readonly FormulaToken[],
  index: number,
  spans: FormulaHighlightSpan[]
): number {
  const root = tokens[index];
  const [dot, member] = [tokens[index + 1], tokens[index + 2]];
  if (isPunct(dot, ".") && member?.type === "identifier") {
    spans.push({ start: root.position, end: member.end, kind: "property" });
    return index + 3;
  }
  const close = tokens[index + 3];
  if (isPunct(dot, "[") && member?.type === "string" && isPunct(close, "]")) {
    spans.push({ start: root.position, end: close.end, kind: "property" });
    return index + 4;
  }
  spans.push({ start: root.position, end: root.end, kind: "property" });
  return index + 1;
}

/**
 * Classify one identifier token with the parser's own lookahead rules;
 * returns the next unconsumed token index. Bare identifiers (no call parens,
 * not after a `.`) are exactly the grammar's name references — let bindings
 * and lambda parameters — so they need no parse to detect.
 */
function classifyIdentifier(
  tokens: readonly FormulaToken[],
  index: number,
  spans: FormulaHighlightSpan[]
): number {
  const token = tokens[index];
  if (token.type !== "identifier") {
    return index + 1;
  }
  const lower = token.value.toLowerCase();
  const span = (kind: FormulaHighlightKind, end = token.end) => {
    spans.push({ start: token.position, end, kind });
    return index + 1;
  };
  if (WORD_LITERALS.has(lower)) {
    return span("literal");
  }
  if (WORD_OPERATORS.has(lower)) {
    return span("operator");
  }
  if (FORMULA_SCOPE_ROOTS.has(lower)) {
    return classifyScopeReference(tokens, index, spans);
  }
  const [open, arg, close] = tokens.slice(index + 1, index + 4);
  const isPropRef =
    lower === FORMULA_PROP_ROOT &&
    isPunct(open, "(") &&
    arg?.type === "string" &&
    isPunct(close, ")");
  if (isPropRef) {
    spans.push({ start: token.position, end: close.end, kind: "property" });
    return index + 4;
  }
  if (isPunct(tokens[index + 1], "(")) {
    return span("function");
  }
  if (isPunct(tokens[index - 1], ".")) {
    return span("property");
  }
  return span("name");
}

/** Spans for the token stream proper (comments are handled separately). */
function tokenSpans(tokens: readonly FormulaToken[]): FormulaHighlightSpan[] {
  const spans: FormulaHighlightSpan[] = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token.type === "eof") {
      break;
    }
    if (token.type === "identifier") {
      index = classifyIdentifier(tokens, index, spans);
      continue;
    }
    if (token.type === "number" || token.type === "string") {
      spans.push({ start: token.position, end: token.end, kind: token.type });
    } else if (OPERATOR_PUNCTS.has(token.value)) {
      spans.push({ start: token.position, end: token.end, kind: "operator" });
    }
    index += 1;
  }
  return spans;
}

/**
 * The kind for an unlexable tail, so mid-typing states stay styled: an
 * unterminated string colors as string, an unterminated block comment as
 * comment; a stray character gets no span.
 */
function tailKind(
  source: string,
  position: number
): FormulaHighlightKind | null {
  const char = source[position];
  if (char === '"' || char === "'") {
    return "string";
  }
  if (source.startsWith("/*", position)) {
    return "comment";
  }
  return null;
}

/** Tokens of `source`'s lexable prefix (whole stream when fully lexable). */
function lexablePrefixTokens(source: string): readonly FormulaToken[] {
  const lexed = tokenizeFormula(source);
  if (lexed.ok) {
    return lexed.tokens;
  }
  const prefix = tokenizeFormula(source.slice(0, lexed.error.position));
  return prefix.ok ? prefix.tokens : [];
}

/**
 * Locate every canonical `prop("<id>")` reference in `source` using the same
 * token-level lookahead the highlighter (and parser) applies, so chip
 * placement can't drift from what highlights as a property. Never throws;
 * on unlexable input the lexable prefix is still scanned (references stay
 * chips while an unterminated string is open later in the doc).
 */
export function formulaPropIdSpans(source: string): FormulaPropIdSpan[] {
  const tokens = lexablePrefixTokens(source);
  const spans: FormulaPropIdSpan[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (
      token.type !== "identifier" ||
      token.value.toLowerCase() !== FORMULA_PROP_ROOT
    ) {
      continue;
    }
    const [open, arg, close] = tokens.slice(index + 1, index + 4);
    if (isPunct(open, "(") && arg?.type === "string" && isPunct(close, ")")) {
      spans.push({ start: token.position, end: close.end, id: arg.value });
      index += 3;
    }
  }
  return spans;
}

/**
 * Classify `source` into sorted, non-overlapping highlight spans. Never
 * throws. When the source doesn't lex (unterminated string mid-keystroke),
 * the lexable prefix still highlights and the tail is classified by what it
 * started as.
 */
export function highlightFormula(source: string): FormulaHighlightSpan[] {
  const lexed = tokenizeFormula(source);
  if (lexed.ok) {
    return [
      ...commentSpans(source, lexed.tokens),
      ...tokenSpans(lexed.tokens),
    ].sort((a, b) => a.start - b.start);
  }
  const { position } = lexed.error;
  const prefix = tokenizeFormula(source.slice(0, position));
  const spans = prefix.ok
    ? [
        ...commentSpans(source.slice(0, position), prefix.tokens),
        ...tokenSpans(prefix.tokens),
      ]
    : [];
  const tail = tailKind(source, position);
  if (tail !== null && position < source.length) {
    spans.push({ start: position, end: source.length, kind: tail });
  }
  return spans.sort((a, b) => a.start - b.start);
}
