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
 * Map an offset into canonical formula text to the equivalent offset in a
 * DISPLAY rendering where every canonical `prop("<id>")` span shows as a
 * label whose length `labelLength` supplies (the chip's field name in the
 * CM6 editor, the humanized `thisPage.Name` form in the textarea). Offsets
 * inside a span clamp to the span's rendered extent, so a position can never
 * point past the label it lands in. Never throws; text without canonical
 * references maps to itself.
 */
export function formulaDisplayOffset(
  source: string,
  offset: number,
  labelLength: (id: string) => number
): number {
  let delta = 0;
  for (const span of formulaPropIdSpans(source)) {
    if (span.end <= offset) {
      delta += labelLength(span.id) - (span.end - span.start);
      continue;
    }
    if (span.start < offset) {
      const into = Math.min(offset - span.start, labelLength(span.id));
      return span.start + delta + into;
    }
    break;
  }
  return offset + delta;
}

/** The innermost unclosed call around a source position. */
export interface FormulaCallSite {
  /** 0-based index of the argument the position falls in. */
  argIndex: number;
  /**
   * The call is dot-chained method syntax (`expr.fn(…)`), where the receiver
   * parses as the first argument (`FormulaCallNode.method`) — so the catalog
   * parameter governing `argIndex` is `formulaParamAt(entry, argIndex + 1)`.
   */
  method: boolean;
  /** The callee identifier as written. */
  name: string;
  /** 0-based source index of the callee identifier's first character. */
  position: number;
}

type CallFrame =
  | { kind: "call"; site: FormulaCallSite }
  | { kind: "group" }
  | { kind: "list" };

/** Track one punct's effect on the open call/group/list nesting. */
function pushCallFrame(
  stack: CallFrame[],
  value: FormulaPunct,
  callee: FormulaToken | undefined,
  beforeCallee: FormulaToken | undefined
): void {
  if (value === "(") {
    stack.push(
      callee?.type === "identifier"
        ? {
            kind: "call",
            site: {
              argIndex: 0,
              method: isPunct(beforeCallee, "."),
              name: callee.value,
              position: callee.position,
            },
          }
        : { kind: "group" }
    );
  } else if (value === "[") {
    stack.push({ kind: "list" });
  } else if (value === ")" || value === "]") {
    stack.pop();
  } else if (value === ",") {
    const top = stack.at(-1);
    if (top?.kind === "call") {
      top.site.argIndex += 1;
    }
  }
}

/**
 * The innermost unclosed function call containing `position`, with the
 * 0-based index of the argument the position falls in — the editor
 * autocomplete's "what does this argument position expect" anchor.
 * Token-level (no parse), so it works on the unparseable mid-typing drafts
 * where completion actually fires; unlexable input scans its lexable prefix
 * (same policy as {@link formulaPropIdSpans}). Grouping parens are
 * transparent (the enclosing call still governs the type); a list literal is
 * a hard boundary (its elements aren't the call's argument). A `.` before
 * the callee marks the site as a method call (the receiver occupies the
 * signature's first parameter). `null` at the top level or when no call is
 * open.
 */
export function formulaEnclosingCallAt(
  source: string,
  position: number
): FormulaCallSite | null {
  const stack: CallFrame[] = [];
  let previous: FormulaToken | undefined;
  let beforePrevious: FormulaToken | undefined;
  for (const token of lexablePrefixTokens(source)) {
    if (token.type === "eof" || token.position >= position) {
      break;
    }
    if (token.type === "punct") {
      pushCallFrame(stack, token.value, previous, beforePrevious);
    }
    beforePrevious = previous;
    previous = token;
  }
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const frame = stack[index];
    if (frame.kind === "call") {
      return frame.site;
    }
    if (frame.kind === "list") {
      return null;
    }
  }
  return null;
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
