import { describe, expect, it } from "vitest";

import { type ExprToken, tokenize } from "@/lib/expr/tokenize.ts";

function tokensOf(source: string): ExprToken[] {
  const result = tokenize(source);
  if (!result.ok) {
    throw new Error(
      `expected ok for ${JSON.stringify(source)}: ${result.error.message}`
    );
  }
  return result.tokens;
}

function errorOf(source: string): { message: string; position: number } {
  const result = tokenize(source);
  if (result.ok) {
    throw new Error(`expected error for ${JSON.stringify(source)}`);
  }
  return result.error;
}

describe("tokenize numbers", () => {
  it("lexes integers", () => {
    expect(tokensOf("42")).toEqual([
      { type: "number", value: 42, position: 0 },
      { type: "eof", position: 2 },
    ]);
  });

  it("lexes decimals", () => {
    expect(tokensOf("3.14")[0]).toEqual({
      type: "number",
      value: 3.14,
      position: 0,
    });
  });

  it("does not swallow a trailing dot without digits", () => {
    expect(tokensOf("3.")).toEqual([
      { type: "number", value: 3, position: 0 },
      { type: "punct", value: ".", position: 1 },
      { type: "eof", position: 2 },
    ]);
  });

  it("tracks positions across whitespace", () => {
    expect(tokensOf("10.5   2")).toEqual([
      { type: "number", value: 10.5, position: 0 },
      { type: "number", value: 2, position: 7 },
      { type: "eof", position: 8 },
    ]);
  });
});

describe("tokenize strings", () => {
  it("lexes double-quoted strings", () => {
    expect(tokensOf('"hello"')[0]).toEqual({
      type: "string",
      value: "hello",
      position: 0,
    });
  });

  it("lexes single-quoted strings", () => {
    expect(tokensOf("'hi there'")[0]).toEqual({
      type: "string",
      value: "hi there",
      position: 0,
    });
  });

  it("decodes escapes", () => {
    expect(tokensOf(String.raw`"a\nb\tc\\d\"e"`)[0]).toEqual({
      type: "string",
      value: 'a\nb\tc\\d"e',
      position: 0,
    });
  });

  it("decodes escaped single quotes", () => {
    expect(tokensOf(String.raw`'it\'s'`)[0]).toEqual({
      type: "string",
      value: "it's",
      position: 0,
    });
  });

  it("passes unknown escapes through literally", () => {
    expect(tokensOf(String.raw`"a\qb"`)[0]).toEqual({
      type: "string",
      value: "aqb",
      position: 0,
    });
  });

  it("keeps the other quote style literal", () => {
    expect(tokensOf(`"it's"`)[0]).toEqual({
      type: "string",
      value: "it's",
      position: 0,
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
      { type: "identifier", value: "_row2", position: 0 },
      { type: "identifier", value: "thisPage", position: 6 },
      { type: "eof", position: 14 },
    ]);
  });
});

describe("tokenize operators", () => {
  it("lexes every two-character operator", () => {
    const values = tokensOf("== != <= >= && ||")
      .filter((token) => token.type === "punct")
      .map((token) => token.value);
    expect(values).toEqual(["==", "!=", "<=", ">=", "&&", "||"]);
  });

  it("lexes every single-character operator", () => {
    const values = tokensOf("+ - * / % ( ) , . [ ] < > !")
      .filter((token) => token.type === "punct")
      .map((token) => token.value);
    expect(values).toEqual([
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
    ]);
  });

  it("prefers two-character operators over their prefixes", () => {
    expect(tokensOf("<=1")).toEqual([
      { type: "punct", value: "<=", position: 0 },
      { type: "number", value: 1, position: 2 },
      { type: "eof", position: 3 },
    ]);
  });

  it("gives a hint for a lone =", () => {
    expect(errorOf("a = 1")).toEqual({
      message: 'Unexpected "=" — use "==" to compare',
      position: 2,
    });
  });

  it("gives a hint for a lone &", () => {
    expect(errorOf("true & false").message).toContain('"&&"');
  });

  it("tokenizes a lone | as the format-pipe operator", () => {
    expect(tokensOf("x | currency")).toEqual([
      { type: "identifier", value: "x", position: 0 },
      { type: "punct", value: "|", position: 2 },
      { type: "identifier", value: "currency", position: 4 },
      { type: "eof", position: 12 },
    ]);
  });

  it("still prefers || (or) over a single |", () => {
    expect(tokensOf("a || b")).toEqual([
      { type: "identifier", value: "a", position: 0 },
      { type: "punct", value: "||", position: 2 },
      { type: "identifier", value: "b", position: 5 },
      { type: "eof", position: 6 },
    ]);
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
    expect(tokensOf("")).toEqual([{ type: "eof", position: 0 }]);
  });

  it("returns only eof for whitespace input", () => {
    expect(tokensOf("  \t\n ")).toEqual([{ type: "eof", position: 5 }]);
  });

  it("lexes a realistic expression", () => {
    const types = tokensOf('if(thisPage.Score >= 10, "high", "low")').map(
      (token) => token.type
    );
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
