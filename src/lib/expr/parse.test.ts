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
    case "variable":
      return `var:${node.name}`;
    case "unary":
      return `(${node.op} ${sexpr(node.operand)})`;
    case "binary":
      return `(${node.op} ${sexpr(node.left)} ${sexpr(node.right)})`;
    case "call":
      return `(${node.name} ${node.args.map(sexpr).join(" ")})`;
    case "pipe":
      return `(| ${node.name} ${[node.input, ...node.args].map(sexpr).join(" ")})`;
    case "list":
      return `[${node.elements.map(sexpr).join(" ")}]`;
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
  it("parses dot access", () => {
    expect(astOf("thisPage.Score")).toEqual({
      kind: "property",
      name: "Score",
      position: 0,
    });
  });

  it("treats thisRow as a synonym for thisPage", () => {
    expect(astOf("thisRow.Score")).toEqual(astOf("thisPage.Score"));
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

  it("parses bare identifiers as variable references (let/current)", () => {
    // v2: bare identifiers are variables resolved at eval time; the
    // unbound-identifier error moved to evaluation (see evaluate.test.ts).
    expect(sexpr(astOf("score + 1"))).toBe("(+ var:score 1)");
    expect(astOf("current")).toEqual({
      kind: "variable",
      name: "current",
      position: 0,
    });
  });

  it("surfaces tokenizer errors through parseExpression", () => {
    expect(errorOf('1 + "oops')).toEqual({
      message: "Unterminated string",
      position: 4,
    });
  });

  it("rejects bare property access on non-scope identifiers", () => {
    // `Tasks.Score` — the dangling `.Score` (no call parens) is a trailing
    // token; only `thisPage.`/`thisRow.` and method calls consume a dot.
    expect(errorOf("Tasks.Score").message).toContain("Unexpected");
  });
});

describe("parse method chaining", () => {
  it("desugars receiver.method(args) into method(receiver, args)", () => {
    expect(sexpr(astOf("thisPage.Name.upper()"))).toBe("(upper prop:Name)");
    expect(sexpr(astOf('"hi".repeat(3)'))).toBe('(repeat "hi" 3)');
    expect(sexpr(astOf("thisPage.Price.round(2)"))).toBe(
      "(round prop:Price 2)"
    );
  });

  it("chains left to right", () => {
    expect(sexpr(astOf("thisPage.Name.trim().upper()"))).toBe(
      "(upper (trim prop:Name))"
    );
  });

  it("leaves scope-root property access as property access", () => {
    expect(sexpr(astOf("thisPage.Name"))).toBe("prop:Name");
  });
});

describe("parse format pipes", () => {
  it("parses a bare pipe and a pipe with args", () => {
    expect(sexpr(astOf("thisPage.Price | currency"))).toBe(
      "(| currency prop:Price)"
    );
    expect(sexpr(astOf('thisPage.Due | date("MMM d")'))).toBe(
      '(| date prop:Due "MMM d")'
    );
  });

  it("is lowest precedence — the whole expression is piped", () => {
    expect(sexpr(astOf("1 + 2 | compact"))).toBe("(| compact (+ 1 2))");
  });

  it("chains left to right", () => {
    expect(sexpr(astOf("thisPage.N | number(2) | plain"))).toBe(
      "(| plain (| number prop:N 2))"
    );
  });

  it("works inside groups and call arguments", () => {
    expect(sexpr(astOf("(1 | compact)"))).toBe("(| compact 1)");
    expect(sexpr(astOf("concat(thisPage.P | currency)"))).toBe(
      "(concat (| currency prop:P))"
    );
  });

  it("errors when a pipe name is missing", () => {
    expect(errorOf("1 | ").message).toContain("pipe name");
  });
});

describe("parse list literals", () => {
  it("parses empty, flat, and nested lists", () => {
    expect(sexpr(astOf("[]"))).toBe("[]");
    expect(sexpr(astOf("[1, 2, 3]"))).toBe("[1 2 3]");
    expect(sexpr(astOf('[thisPage.Name, "x"]'))).toBe('[prop:Name "x"]');
    expect(sexpr(astOf("[[1, 2], [3]]"))).toBe("[[1 2] [3]]");
  });

  it("supports method chaining and pipes on a list", () => {
    expect(sexpr(astOf("[3, 1, 2].sort()"))).toBe("(sort [3 1 2])");
    expect(sexpr(astOf("[1, 2] | plain"))).toBe("(| plain [1 2])");
  });

  it("errors on an unclosed list", () => {
    expect(errorOf("[1, 2").message).toContain("close the list");
  });
});

describe("parse let / switch", () => {
  it("parses let bindings with variable references in the body", () => {
    expect(sexpr(astOf("let(x, 1, x + 2)"))).toBe("(let var:x 1 (+ var:x 2))");
  });

  it("parses lets and switch as ordinary calls", () => {
    expect(sexpr(astOf("lets(a, 1, b, 2, a + b)"))).toBe(
      "(lets var:a 1 var:b 2 (+ var:a var:b))"
    );
    expect(sexpr(astOf('switch(thisPage.S, "a", 1, 0)'))).toBe(
      '(switch prop:S "a" 1 0)'
    );
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
