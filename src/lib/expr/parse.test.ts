import { describe, expect, it } from "vitest";

import { type ExprNode, parseExpression } from "@/lib/expr/parse.ts";

function astOf(source: string): ExprNode {
  const result = parseExpression(source);
  if (!result.ok) {
    throw new Error(
      `expected ok for ${JSON.stringify(source)}: ${result.error.message}`
    );
  }
  return result.ast;
}

function errorOf(source: string): { message: string; position: number } {
  const result = parseExpression(source);
  if (result.ok) {
    throw new Error(`expected error for ${JSON.stringify(source)}`);
  }
  return result.error;
}

/** Compact s-expression rendering so precedence tests read at a glance. */
function sexpr(node: ExprNode): string {
  switch (node.kind) {
    case "literal":
      return JSON.stringify(node.value);
    case "property":
      return `prop:${node.name}`;
    case "unary":
      return `(${node.op} ${sexpr(node.operand)})`;
    case "binary":
      return `(${node.op} ${sexpr(node.left)} ${sexpr(node.right)})`;
    case "call":
      return `(${node.name} ${node.args.map(sexpr).join(" ")})`;
    default:
      return "?";
  }
}

describe("parse literals", () => {
  it("parses numbers, strings, booleans, and null", () => {
    expect(sexpr(astOf("42"))).toBe("42");
    expect(sexpr(astOf('"hi"'))).toBe('"hi"');
    expect(sexpr(astOf("true"))).toBe("true");
    expect(sexpr(astOf("false"))).toBe("false");
    expect(sexpr(astOf("null"))).toBe("null");
  });

  it("treats keyword literals case-insensitively", () => {
    expect(sexpr(astOf("TRUE"))).toBe("true");
    expect(sexpr(astOf("False"))).toBe("false");
    expect(sexpr(astOf("NULL"))).toBe("null");
  });
});

describe("parse precedence", () => {
  const table: [string, string][] = [
    ["1 + 2 * 3", "(+ 1 (* 2 3))"],
    ["1 * 2 + 3", "(+ (* 1 2) 3)"],
    ["(1 + 2) * 3", "(* (+ 1 2) 3)"],
    ["10 - 2 - 3", "(- (- 10 2) 3)"],
    ["12 / 2 / 3", "(/ (/ 12 2) 3)"],
    ["7 % 3 * 2", "(* (% 7 3) 2)"],
    ["1 + 2 < 4", "(< (+ 1 2) 4)"],
    ["1 < 2 == true", "(== (< 1 2) true)"],
    ["1 == 2 and true", "(and (== 1 2) true)"],
    ["true and false or true", "(or (and true false) true)"],
    ["true or false and false", "(or true (and false false))"],
    ["not true and false", "(and (not true) false)"],
    ["not (true and false)", "(not (and true false))"],
    ["-2 + 3", "(+ (- 2) 3)"],
    ["- 2 * 3", "(* (- 2) 3)"],
    ["--2", "(- (- 2))"],
    ["1 != 2 != false", "(!= (!= 1 2) false)"],
    ["1 <= 2 >= 0", "(>= (<= 1 2) 0)"],
  ];
  for (const [source, expected] of table) {
    it(`parses ${source}`, () => {
      expect(sexpr(astOf(source))).toBe(expected);
    });
  }

  it("normalizes && / || / ! to and / or / not", () => {
    expect(sexpr(astOf("!true && false || true"))).toBe(
      "(or (and (not true) false) true)"
    );
  });
});

describe("parse property references", () => {
  it("parses dot access with the full source span", () => {
    expect(astOf("thisPage.Score")).toEqual({
      kind: "property",
      name: "Score",
      position: 0,
      end: "thisPage.Score".length,
      via: "scope",
    });
  });

  it("treats thisRow as a synonym for thisPage", () => {
    // Spans differ (the roots have different lengths); the reference doesn't.
    expect(sexpr(astOf("thisRow.Score"))).toBe(sexpr(astOf("thisPage.Score")));
  });

  it("matches scope roots case-insensitively", () => {
    expect(sexpr(astOf("THISPAGE.Score"))).toBe("prop:Score");
    expect(sexpr(astOf("thisrow.Score"))).toBe("prop:Score");
  });

  it("parses bracket access with spaces in the name", () => {
    expect(astOf('thisPage["Due Date"]')).toEqual({
      kind: "property",
      name: "Due Date",
      position: 0,
      end: 'thisPage["Due Date"]'.length,
      via: "scope",
    });
  });

  it("parses single-quoted bracket access", () => {
    expect(sexpr(astOf("thisRow['A b c']"))).toBe("prop:A b c");
  });

  it("requires a property name after the dot", () => {
    expect(errorOf("thisPage.").message).toContain("property name");
  });

  it("requires a string literal inside brackets", () => {
    expect(errorOf("thisPage[42]").message).toContain("quoted property name");
  });

  it("requires a closing bracket", () => {
    expect(errorOf('thisPage["X"').message).toContain('"]"');
  });

  it("rejects a bare scope root", () => {
    expect(errorOf("thisPage").message).toContain('Expected "." or "["');
  });
});

describe("parse prop references", () => {
  it("parses prop() as a property node with the full source span", () => {
    expect(astOf('prop("f_8a2c")')).toEqual({
      kind: "property",
      name: "f_8a2c",
      position: 0,
      end: 'prop("f_8a2c")'.length,
      via: "prop",
    });
  });

  it("matches prop case-insensitively", () => {
    expect(sexpr(astOf('PROP("x")'))).toBe("prop:x");
    expect(sexpr(astOf('Prop("x")'))).toBe("prop:x");
  });

  it("accepts single-quoted ids and string escapes", () => {
    expect(sexpr(astOf("prop('abc')"))).toBe("prop:abc");
    expect(sexpr(astOf('prop("a\\"b")'))).toBe('prop:a"b');
  });

  it("parses prop() inside larger expressions with correct spans", () => {
    const source = '1 + prop("f1") * 2';
    const ast = astOf(source);
    expect(sexpr(ast)).toBe("(+ 1 (* prop:f1 2))");
    if (ast.kind !== "binary" || ast.right.kind !== "binary") {
      throw new Error("expected nested binary");
    }
    expect(ast.right.left).toMatchObject({
      kind: "property",
      position: source.indexOf("prop"),
      end: source.indexOf(")") + 1,
    });
  });

  it("rejects prop with no argument", () => {
    expect(errorOf("prop()").message).toContain("one quoted field id");
  });

  it("rejects prop with two arguments", () => {
    expect(errorOf('prop("a", "b")').message).toContain(
      "exactly one quoted field id"
    );
  });

  it("rejects non-string arguments", () => {
    expect(errorOf("prop(42)").message).toContain("one quoted field id");
    expect(errorOf("prop(thisPage.X)").message).toContain(
      "one quoted field id"
    );
  });

  it("rejects a bare prop identifier", () => {
    expect(errorOf("prop").message).toContain('"prop(…)"');
  });

  it("rejects an unclosed prop reference", () => {
    expect(errorOf('prop("a"').message).toContain('close the "prop(…)"');
  });
});

describe("parse function calls", () => {
  it("parses zero-argument calls", () => {
    expect(sexpr(astOf("now()"))).toBe("(now )");
  });

  it("parses multi-argument and nested calls", () => {
    expect(sexpr(astOf('if(contains("ab", "a"), 1, round(2.5, 0))'))).toBe(
      '(if (contains "ab" "a") 1 (round 2.5 0))'
    );
  });

  it("keeps the call name as written for case-insensitive lookup", () => {
    const ast = astOf("ROUND(1.5)");
    expect(ast).toMatchObject({ kind: "call", name: "ROUND" });
  });

  it("parses full expressions as arguments", () => {
    expect(sexpr(astOf("max(1 + 2, 3 * 4)"))).toBe("(max (+ 1 2) (* 3 4))");
  });

  it("errors on a missing closing paren with position", () => {
    const error = errorOf("round(1.5");
    expect(error.message).toContain('")"');
    expect(error.position).toBe(9);
  });

  it("errors on a trailing comma", () => {
    expect(errorOf("max(1, )").message).toContain("Unexpected");
  });
});

describe("parse errors", () => {
  it("reports empty input", () => {
    expect(errorOf("")).toEqual({ message: "Empty expression", position: 0 });
    expect(errorOf("   ").message).toBe("Empty expression");
  });

  it("reports a dangling operator at end of expression", () => {
    const error = errorOf("1 +");
    expect(error.message).toContain("end of expression");
    expect(error.position).toBe(3);
  });

  it("reports trailing tokens", () => {
    const error = errorOf("1 2");
    expect(error.message).toContain("Unexpected");
    expect(error.position).toBe(2);
  });

  it("reports an unmatched closing paren", () => {
    expect(errorOf(")").position).toBe(0);
  });

  it("reports an unclosed group", () => {
    expect(errorOf("(1 + 2").message).toContain("close the group");
  });

  it("rejects bare identifiers with a helpful message", () => {
    const error = errorOf("score + 1");
    expect(error.message).toContain('Unknown identifier "score"');
    expect(error.message).toContain("thisPage");
    expect(error.position).toBe(0);
  });

  it("surfaces tokenizer errors through parseExpression", () => {
    expect(errorOf('1 + "oops')).toEqual({
      message: "Unterminated string",
      position: 4,
    });
  });

  it("rejects member access on non-scope identifiers", () => {
    expect(errorOf("Tasks.Score").message).toContain("Unknown identifier");
  });
});

describe("parse guards (depth and length)", () => {
  it("returns a parse error instead of overflowing on deeply nested parens", () => {
    const source = `${"(".repeat(2000)}1${")".repeat(2000)}`;
    const error = errorOf(source);
    expect(error.message).toContain("too deeply nested");
  });

  it("returns a parse error instead of overflowing on long unary chains", () => {
    expect(errorOf(`${"-".repeat(5000)}1`).message).toContain(
      "too deeply nested"
    );
    expect(errorOf(`${"!".repeat(5000)}true`).message).toContain(
      "too deeply nested"
    );
  });

  it("rejects over-long expression sources with a parse error", () => {
    const error = errorOf(`1 +${" ".repeat(20_000)} 2`);
    expect(error.message).toContain("Expression too long");
    expect(error.position).toBe(0);
  });

  it("still parses reasonably nested groups", () => {
    const source = `${"(".repeat(20)}1 + 2${")".repeat(20)}`;
    expect(sexpr(astOf(source))).toBe("(+ 1 2)");
  });
});
