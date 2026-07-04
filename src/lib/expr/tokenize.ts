/**
 * Tokenizer for the shared expression language (`lib/expr`) — the engine
 * behind database formula fields and `{{ … }}` tokens in row-page templates.
 * Pure and React-free. Produces a flat, `eof`-terminated token stream with
 * 0-based source positions so the parser can report precise errors.
 */

/** A source-positioned lexer/parser error. `position` is a 0-based character index. */
export interface ExprSourceError {
  message: string;
  position: number;
}

/** Punctuation / operator lexemes the tokenizer recognizes. */
export type ExprPunct =
  | "=="
  | "!="
  | "<="
  | ">="
  | "&&"
  | "||"
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "("
  | ")"
  | ","
  | "."
  | "["
  | "]"
  | "<"
  | ">"
  | "!"
  | "|";

/** One lexed token. `position` is the 0-based index of the token's first character. */
export type ExprToken =
  | { type: "number"; value: number; position: number }
  | { type: "string"; value: string; position: number }
  | { type: "identifier"; value: string; position: number }
  | { type: "punct"; value: ExprPunct; position: number }
  | { type: "eof"; position: number };

/** Result of {@link tokenize}: an `eof`-terminated stream or a positioned error. */
export type TokenizeResult =
  | { ok: true; tokens: ExprToken[] }
  | { ok: false; error: ExprSourceError };

const WHITESPACE_RE = /\s/;
const DIGIT_RE = /[0-9]/;
const IDENTIFIER_START_RE = /[A-Za-z_]/;
const IDENTIFIER_PART_RE = /[A-Za-z0-9_]/;

/** Two-character operators, matched before their single-character prefixes. */
const TWO_CHAR_PUNCTS = ["==", "!=", "<=", ">=", "&&", "||"] as const;

const SINGLE_CHAR_PUNCTS = new Set<ExprPunct>([
  "+",
  "-",
  "*",
  "/",
  "%",
  "(",
  ")",
  ",",
  ".",
  "[",
  "]",
  "<",
  ">",
  "!",
  // Single `|` is the format-pipe operator (`value | currency`); `||` is still
  // matched first as the `or` operator via TWO_CHAR_PUNCTS.
  "|",
]);

/** Named escape sequences inside string literals; any other `\x` yields `x`. */
const STRING_ESCAPES = new Map<string, string>([
  ["n", "\n"],
  ["t", "\t"],
  ["r", "\r"],
]);

/** Hints for characters that are only valid as part of a two-character operator. */
const LONELY_CHAR_HINTS = new Map<string, string>([
  ["=", 'Unexpected "=" — use "==" to compare'],
  ["&", 'Unexpected "&" — use "&&" or "and"'],
]);

interface TokenStep {
  next: number;
  token: ExprToken;
}

function readNumber(source: string, start: number): TokenStep {
  let index = start;
  while (index < source.length && DIGIT_RE.test(source[index])) {
    index += 1;
  }
  const hasFraction =
    source[index] === "." &&
    index + 1 < source.length &&
    DIGIT_RE.test(source[index + 1]);
  if (hasFraction) {
    index += 1;
    while (index < source.length && DIGIT_RE.test(source[index])) {
      index += 1;
    }
  }
  return {
    token: {
      type: "number",
      value: Number.parseFloat(source.slice(start, index)),
      position: start,
    },
    next: index,
  };
}

function readString(
  source: string,
  start: number
): TokenStep | ExprSourceError {
  const quote = source[start];
  let value = "";
  let index = start + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === quote) {
      return {
        token: { type: "string", value, position: start },
        next: index + 1,
      };
    }
    if (char === "\\" && index + 1 < source.length) {
      const escaped = source[index + 1];
      value += STRING_ESCAPES.get(escaped) ?? escaped;
      index += 2;
      continue;
    }
    value += char;
    index += 1;
  }
  return { message: "Unterminated string", position: start };
}

function readIdentifier(source: string, start: number): TokenStep {
  let index = start + 1;
  while (index < source.length && IDENTIFIER_PART_RE.test(source[index])) {
    index += 1;
  }
  return {
    token: {
      type: "identifier",
      value: source.slice(start, index),
      position: start,
    },
    next: index,
  };
}

function readPunct(source: string, start: number): TokenStep | ExprSourceError {
  for (const punct of TWO_CHAR_PUNCTS) {
    if (source.startsWith(punct, start)) {
      return {
        token: { type: "punct", value: punct, position: start },
        next: start + punct.length,
      };
    }
  }
  const char = source[start];
  if (SINGLE_CHAR_PUNCTS.has(char as ExprPunct)) {
    return {
      token: { type: "punct", value: char as ExprPunct, position: start },
      next: start + 1,
    };
  }
  const hint = LONELY_CHAR_HINTS.get(char);
  return {
    message: hint ?? `Unexpected character "${char}"`,
    position: start,
  };
}

function readToken(source: string, start: number): TokenStep | ExprSourceError {
  const char = source[start];
  if (DIGIT_RE.test(char)) {
    return readNumber(source, start);
  }
  if (char === '"' || char === "'") {
    return readString(source, start);
  }
  if (IDENTIFIER_START_RE.test(char)) {
    return readIdentifier(source, start);
  }
  return readPunct(source, start);
}

/**
 * Lex an expression source string into tokens. Never throws: lexical problems
 * (unterminated strings, stray characters) come back as a positioned error.
 * On success the stream always ends with an `eof` token.
 */
export function tokenize(source: string): TokenizeResult {
  const tokens: ExprToken[] = [];
  let index = 0;
  while (index < source.length) {
    if (WHITESPACE_RE.test(source[index])) {
      index += 1;
      continue;
    }
    const step = readToken(source, index);
    if ("message" in step) {
      return { ok: false, error: step };
    }
    tokens.push(step.token);
    index = step.next;
  }
  tokens.push({ type: "eof", position: source.length });
  return { ok: true, tokens };
}
