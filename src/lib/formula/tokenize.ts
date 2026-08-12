/**
 * Tokenizer for the v2 formula language (`lib/formula`) — the grammar behind
 * database formula fields. Pure and React-free. Produces a flat,
 * `eof`-terminated token stream with 0-based source spans (`position`
 * inclusive, `end` exclusive) so the parser can report precise errors and
 * attach exact spans to every AST node.
 *
 * Beyond the retired v1 lexer this one skips `//` line comments and
 * slash-star block comments, accepts exponent number literals (`1e5`,
 * `2.5e-3`), and recognizes the `??`, `^`, and `=>` operators plus the `=`
 * and `;` puncts of top-level `let` statements (the parser rejects them
 * everywhere else, with hints).
 */

/** A source-positioned lexer/parser error. `position` is a 0-based character index. */
export interface FormulaSourceError {
  message: string;
  position: number;
}

/** Punctuation / operator lexemes the tokenizer recognizes. */
export type FormulaPunct =
  | "=="
  | "!="
  | "<="
  | ">="
  | "&&"
  | "||"
  | "??"
  | "=>"
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "^"
  | "("
  | ")"
  | ","
  | "."
  | "["
  | "]"
  | "<"
  | ">"
  | "!"
  | "="
  | ";";

/**
 * One lexed token. `position` is the 0-based index of the token's first
 * character; `end` is the index just past its last character (exclusive).
 */
export type FormulaToken =
  | { type: "number"; value: number; position: number; end: number }
  | { type: "string"; value: string; position: number; end: number }
  | { type: "identifier"; value: string; position: number; end: number }
  | { type: "punct"; value: FormulaPunct; position: number; end: number }
  | { type: "eof"; position: number; end: number };

/** Result of {@link tokenizeFormula}: an `eof`-terminated stream or a positioned error. */
export type TokenizeFormulaResult =
  | { ok: true; tokens: FormulaToken[] }
  | { ok: false; error: FormulaSourceError };

const WHITESPACE_RE = /\s/;
const DIGIT_RE = /[0-9]/;
const IDENTIFIER_START_RE = /[A-Za-z_]/;
const IDENTIFIER_PART_RE = /[A-Za-z0-9_]/;

/** Two-character operators, matched before their single-character prefixes. */
const TWO_CHAR_PUNCTS = [
  "==",
  "=>",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "??",
] as const;

const SINGLE_CHAR_PUNCTS = new Set<FormulaPunct>([
  "+",
  "-",
  "*",
  "/",
  "%",
  "^",
  "(",
  ")",
  ",",
  ".",
  "[",
  "]",
  "<",
  ">",
  "!",
  "=",
  ";",
]);

/** Named escape sequences inside string literals; any other `\x` yields `x`. */
const STRING_ESCAPES = new Map<string, string>([
  ["n", "\n"],
  ["t", "\t"],
  ["r", "\r"],
]);

/** Hints for characters that are only valid as part of a two-character operator. */
const LONELY_CHAR_HINTS = new Map<string, string>([
  ["&", 'Unexpected "&" — use "&&" or "and"'],
  ["|", 'Unexpected "|" — use "||" or "or"'],
  ["?", 'Unexpected "?" — use "??" to fall back when a value is blank'],
]);

interface TokenStep {
  next: number;
  token: FormulaToken;
}

function readDigits(source: string, start: number): number {
  let index = start;
  while (index < source.length && DIGIT_RE.test(source[index])) {
    index += 1;
  }
  return index;
}

/**
 * Consume a well-formed exponent suffix (`e5`, `E+9`, `e-3`) after the
 * digits already read. A malformed suffix (`1e`, `1e+`) is left alone so the
 * `e…` lexes as a separate identifier/operator instead of a bad number.
 */
function readExponent(source: string, start: number): number {
  if (source[start] !== "e" && source[start] !== "E") {
    return start;
  }
  let index = start + 1;
  if (source[index] === "+" || source[index] === "-") {
    index += 1;
  }
  if (index < source.length && DIGIT_RE.test(source[index])) {
    return readDigits(source, index);
  }
  return start;
}

function readNumber(source: string, start: number): TokenStep {
  let index = readDigits(source, start);
  const hasFraction =
    source[index] === "." &&
    index + 1 < source.length &&
    DIGIT_RE.test(source[index + 1]);
  if (hasFraction) {
    index = readDigits(source, index + 1);
  }
  index = readExponent(source, index);
  return {
    token: {
      type: "number",
      value: Number.parseFloat(source.slice(start, index)),
      position: start,
      end: index,
    },
    next: index,
  };
}

function readString(
  source: string,
  start: number
): TokenStep | FormulaSourceError {
  const quote = source[start];
  let value = "";
  let index = start + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === quote) {
      return {
        token: { type: "string", value, position: start, end: index + 1 },
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
      end: index,
    },
    next: index,
  };
}

function readPunct(
  source: string,
  start: number
): TokenStep | FormulaSourceError {
  for (const punct of TWO_CHAR_PUNCTS) {
    if (source.startsWith(punct, start)) {
      return {
        token: {
          type: "punct",
          value: punct,
          position: start,
          end: start + punct.length,
        },
        next: start + punct.length,
      };
    }
  }
  const char = source[start];
  if (SINGLE_CHAR_PUNCTS.has(char as FormulaPunct)) {
    return {
      token: {
        type: "punct",
        value: char as FormulaPunct,
        position: start,
        end: start + 1,
      },
      next: start + 1,
    };
  }
  const hint = LONELY_CHAR_HINTS.get(char);
  return {
    message: hint ?? `Unexpected character "${char}"`,
    position: start,
  };
}

/**
 * Skip one comment starting at `index`. Returns the index just past the
 * comment, `index` unchanged when no comment starts there, or a positioned
 * error for an unterminated block comment. Block comments do not nest: the
 * first star-slash closes the comment.
 */
function skipComment(
  source: string,
  index: number
): number | FormulaSourceError {
  if (source.startsWith("//", index)) {
    const newline = source.indexOf("\n", index + 2);
    return newline === -1 ? source.length : newline + 1;
  }
  if (source.startsWith("/*", index)) {
    const close = source.indexOf("*/", index + 2);
    if (close === -1) {
      return {
        message: 'Unterminated block comment — close it with "*/"',
        position: index,
      };
    }
    return close + 2;
  }
  return index;
}

function readToken(
  source: string,
  start: number
): TokenStep | FormulaSourceError {
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
 * Lex a formula source string into tokens. Never throws: lexical problems
 * (unterminated strings or block comments, stray characters) come back as a
 * positioned error. Comments and whitespace are skipped. On success the
 * stream always ends with an `eof` token.
 */
export function tokenizeFormula(source: string): TokenizeFormulaResult {
  const tokens: FormulaToken[] = [];
  let index = 0;
  while (index < source.length) {
    if (WHITESPACE_RE.test(source[index])) {
      index += 1;
      continue;
    }
    const afterComment = skipComment(source, index);
    if (typeof afterComment !== "number") {
      return { ok: false, error: afterComment };
    }
    if (afterComment !== index) {
      index = afterComment;
      continue;
    }
    const step = readToken(source, index);
    if ("message" in step) {
      return { ok: false, error: step };
    }
    tokens.push(step.token);
    index = step.next;
  }
  tokens.push({ type: "eof", position: source.length, end: source.length });
  return { ok: true, tokens };
}
