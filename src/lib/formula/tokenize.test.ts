import { describe, expect, it } from "vitest";

import { type FormulaToken, tokenizeFormula } from "@/lib/formula/tokenize.ts";

function tokensOf(source: string): FormulaToken[] {
  const result = tokenizeFormula(source);
  if (!result.ok) {
    throw new Error(
      `expected ok for ${JSON.stringify(source)}: ${result.error.message}`
    );
  }
  return result.tokens;
}

function errorOf(source: string): { message: string; position: number } {
  const result = tokenizeFormula(source);
  if (result.ok) {
    throw new Error(`expected error for ${JSON.stringify(source)}`);
  }
  return result.error;
}

describe("tokenize numbers", () => {
  it("lexes integers with spans", () => {
    expect(tokensOf("42")).toEqual([
      { type: "number", value: 42, position: 0, end: 2 },
      { type: "eof", position: 2, end: 2 },
    ]);
  });

  it("lexes decimals", () => {
    expect(tokensOf("3.14")[0]).toEqual({
      type: "number",
      value: 3.14,
      position: 0,
      end: 4,
    });
  });

  it("does not swallow a trailing dot without digits", () => {
    expect(tokensOf("3.")).toEqual([
      { type: "number", value: 3, position: 0, end: 1 },
      { type: "punct", value: ".", position: 1, end: 2 },
      { type: "eof", position: 2, end: 2 },
    ]);
  });

  it("tracks positions across whitespace", () => {
    expect(tokensOf("10.5   2")).toEqual([
      { type: "number", value: 10.5, position: 0, end: 4 },
      { type: "number", value: 2, position: 7, end: 8 },
      { type: "eof", position: 8, end: 8 },
    ]);
  });
});

describe("tokenize exponent literals", () => {
  it("lexes a plain exponent", () => {
    expect(tokensOf("1e5")[0]).toEqual({
      type: "number",
      value: 100_000,
      position: 0,
      end: 3,
    });
  });

  it("lexes a fractional negative exponent", () => {
    expect(tokensOf("2.5e-3")[0]).toEqual({
      type: "number",
      value: 0.0025,
      position: 0,
      end: 6,
    });
  });

  it("lexes an uppercase positive exponent", () => {
    expect(tokensOf("1E+9")[0]).toEqual({
      type: "number",
      value: 1_000_000_000,
      position: 0,
      end: 4,
    });
  });

  it("leaves a bare e suffix to lex as an identifier", () => {
    expect(tokensOf("1e")).toEqual([
      { type: "number", value: 1, position: 0, end: 1 },
      { type: "identifier", value: "e", position: 1, end: 2 },
      { type: "eof", position: 2, end: 2 },
    ]);
  });

  it("leaves a signed-but-empty exponent to lex separately", () => {
    const types = tokensOf("1e+").map((token) => token.type);
    expect(types).toEqual(["number", "identifier", "punct", "eof"]);
  });

  it("does not accept a trailing-dot exponent", () => {
    expect(tokensOf("1.e5")).toEqual([
      { type: "number", value: 1, position: 0, end: 1 },
      { type: "punct", value: ".", position: 1, end: 2 },
      { type: "identifier", value: "e5", position: 2, end: 4 },
      { type: "eof", position: 4, end: 4 },
    ]);
  });

  it("does not accept a leading-dot number", () => {
    const types = tokensOf(".5").map((token) => token.type);
    expect(types).toEqual(["punct", "number", "eof"]);
  });
});

describe("tokenize comments", () => {
  it("skips a line comment to the end of line", () => {
    expect(tokensOf("1 // add one\n+ 2")).toEqual([
      { type: "number", value: 1, position: 0, end: 1 },
      { type: "punct", value: "+", position: 13, end: 14 },
      { type: "number", value: 2, position: 15, end: 16 },
      { type: "eof", position: 16, end: 16 },
    ]);
  });

  it("skips a line comment at the end of input without a newline", () => {
    expect(tokensOf("1 // done")).toEqual([
      { type: "number", value: 1, position: 0, end: 1 },
      { type: "eof", position: 9, end: 9 },
    ]);
  });

  it("skips an inline block comment", () => {
    expect(tokensOf("1 /* middle */ + 2").map((token) => token.type)).toEqual([
      "number",
      "punct",
      "number",
      "eof",
    ]);
  });

  it("skips a multi-line block comment", () => {
    expect(tokensOf("1 /* a\nb\nc */ + 2").map((token) => token.type)).toEqual([
      "number",
      "punct",
      "number",
      "eof",
    ]);
  });

  it("does not nest block comments", () => {
    // The first */ closes the comment, so `c` lexes as an identifier.
    expect(tokensOf("/* a /* b */ c")).toEqual([
      { type: "identifier", value: "c", position: 13, end: 14 },
      { type: "eof", position: 14, end: 14 },
    ]);
  });

  it("keeps comment markers inside strings literal", () => {
    expect(tokensOf('"// not a comment"')[0]).toEqual({
      type: "string",
      value: "// not a comment",
      position: 0,
      end: 18,
    });
  });

  it("errors on an unterminated block comment at its opener", () => {
    expect(errorOf("1 + /* oops")).toEqual({
      message: 'Unterminated block comment — close it with "*/"',
      position: 4,
    });
  });

  it("still lexes division", () => {
    expect(tokensOf("4 / 2").map((token) => token.type)).toEqual([
      "number",
      "punct",
      "number",
      "eof",
    ]);
  });
});

describe("tokenize strings", () => {
  it("lexes double-quoted strings", () => {
    expect(tokensOf('"hello"')[0]).toEqual({
      type: "string",
      value: "hello",
      position: 0,
      end: 7,
    });
  });

  it("lexes single-quoted strings", () => {
    expect(tokensOf("'hi there'")[0]).toEqual({
      type: "string",
      value: "hi there",
      position: 0,
      end: 10,
    });
  });

  it("decodes escapes", () => {
    expect(tokensOf(String.raw`"a\nb\tc\\d\"e"`)[0]).toMatchObject({
      type: "string",
      value: 'a\nb\tc\\d"e',
      position: 0,
    });
  });

  it("decodes escaped single quotes", () => {
    expect(tokensOf(String.raw`'it\'s'`)[0]).toMatchObject({
      type: "string",
      value: "it's",
    });
  });

  it("passes unknown escapes through literally", () => {
    expect(tokensOf(String.raw`"a\qb"`)[0]).toMatchObject({
      type: "string",
      value: "aqb",
    });
  });

  it("keeps the other quote style literal", () => {
    expect(tokensOf(`"it's"`)[0]).toMatchObject({
      type: "string",
      value: "it's",
    });
  });

  it("errors on unterminated strings at the opening quote", () => {
    expect(errorOf('1 + "oops')).toEqual({
      message: "Unterminated string",
      position: 4,
    });
  });

  it("errors on a string ending in a bare backslash", () => {
    expect(errorOf('"a\\')).toEqual({
      message: "Unterminated string",
      position: 0,
    });
  });
});

describe("tokenize identifiers", () => {
  it("lexes identifiers with underscores and digits", () => {
    expect(tokensOf("_row2 thisPage")).toEqual([
      { type: "identifier", value: "_row2", position: 0, end: 5 },
      { type: "identifier", value: "thisPage", position: 6, end: 14 },
      { type: "eof", position: 14, end: 14 },
    ]);
  });
});

describe("tokenize operators", () => {
  it("lexes every two-character operator", () => {
    const values = tokensOf("== != <= >= && || ?? =>")
      .filter((token) => token.type === "punct")
      .map((token) => token.value);
    expect(values).toEqual(["==", "!=", "<=", ">=", "&&", "||", "??", "=>"]);
  });

  it("lexes every single-character operator", () => {
    const values = tokensOf("+ - * / % ^ ( ) , . [ ] < > ! = ;")
      .filter((token) => token.type === "punct")
      .map((token) => token.value);
    expect(values).toEqual([
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
  });

  it("prefers two-character operators over their prefixes", () => {
    expect(tokensOf("<=1")).toEqual([
      { type: "punct", value: "<=", position: 0, end: 2 },
      { type: "number", value: 1, position: 2, end: 3 },
      { type: "eof", position: 3, end: 3 },
    ]);
  });

  it("lexes => tightly against its neighbors", () => {
    expect(tokensOf("x=>y")).toEqual([
      { type: "identifier", value: "x", position: 0, end: 1 },
      { type: "punct", value: "=>", position: 1, end: 3 },
      { type: "identifier", value: "y", position: 3, end: 4 },
      { type: "eof", position: 4, end: 4 },
    ]);
  });

  it("lexes a lone = as its own punct (the let-statement equals)", () => {
    // The "=" vs "==" hint moved to the parser, which knows whether the
    // token sits in a let statement (see parse.test.ts).
    expect(tokensOf("a = 1")).toEqual([
      { type: "identifier", value: "a", position: 0, end: 1 },
      { type: "punct", value: "=", position: 2, end: 3 },
      { type: "number", value: 1, position: 4, end: 5 },
      { type: "eof", position: 5, end: 5 },
    ]);
  });

  it("lexes ; as its own punct, tightly against neighbors", () => {
    expect(tokensOf("let x = 1;x")).toEqual([
      { type: "identifier", value: "let", position: 0, end: 3 },
      { type: "identifier", value: "x", position: 4, end: 5 },
      { type: "punct", value: "=", position: 6, end: 7 },
      { type: "number", value: 1, position: 8, end: 9 },
      { type: "punct", value: ";", position: 9, end: 10 },
      { type: "identifier", value: "x", position: 10, end: 11 },
      { type: "eof", position: 11, end: 11 },
    ]);
  });

  it("gives a hint for a lone &", () => {
    expect(errorOf("true & false").message).toContain('"&&"');
  });

  it("gives a hint for a lone |", () => {
    expect(errorOf("true | false").message).toContain('"||"');
  });

  it("gives a hint for a lone ?", () => {
    expect(errorOf("a ? b")).toEqual({
      message: 'Unexpected "?" — use "??" to fall back when a value is blank',
      position: 2,
    });
  });

  it("errors on unexpected characters with their position", () => {
    expect(errorOf("1 + @")).toEqual({
      message: 'Unexpected character "@"',
      position: 4,
    });
  });
});

describe("tokenize whitespace and eof", () => {
  it("returns only eof for empty input", () => {
    expect(tokensOf("")).toEqual([{ type: "eof", position: 0, end: 0 }]);
  });

  it("returns only eof for whitespace input", () => {
    expect(tokensOf("  \t\n ")).toEqual([{ type: "eof", position: 5, end: 5 }]);
  });

  it("returns only eof for comment-only input", () => {
    expect(tokensOf("// nothing here").map((token) => token.type)).toEqual([
      "eof",
    ]);
    expect(tokensOf("/* nothing */").map((token) => token.type)).toEqual([
      "eof",
    ]);
  });

  it("lexes a realistic multi-line expression", () => {
    const source = [
      "// score band",
      'if(thisPage.Score >= 1e2, "high", "low")',
    ].join("\n");
    const types = tokensOf(source).map((token) => token.type);
    expect(types).toEqual([
      "identifier",
      "punct",
      "identifier",
      "punct",
      "identifier",
      "punct",
      "number",
      "punct",
      "string",
      "punct",
      "string",
      "punct",
      "eof",
    ]);
  });
});
