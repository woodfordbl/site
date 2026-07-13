import { describe, expect, it } from "vitest";

import {
  type FormulaNode,
  formulaNodeChildren,
  walkFormula,
} from "@/lib/formula/ast.ts";
import { V1_GOLDEN_CORPUS } from "@/lib/formula/corpus.fixture.ts";
import { parseFormula } from "@/lib/formula/parse.ts";

function astOf(source: string): FormulaNode {
  const result = parseFormula(source);
  if (!result.ok) {
    throw new Error(
      `expected ok for ${JSON.stringify(source)}: ${result.error.message}`
    );
  }
  return result.ast;
}

function errorOf(source: string): { message: string; position: number } {
  const result = parseFormula(source);
  if (result.ok) {
    throw new Error(`expected error for ${JSON.stringify(source)}`);
  }
  return result.error;
}

/** Compact s-expression rendering so precedence tests read at a glance. */
function sexpr(node: FormulaNode): string {
  switch (node.kind) {
    case "literal":
      return JSON.stringify(node.value);
    case "property":
      return `prop:${node.name}`;
    case "name":
      return `name:${node.name}`;
    case "unary":
      return `(${node.op} ${sexpr(node.operand)})`;
    case "binary":
      return `(${node.op} ${sexpr(node.left)} ${sexpr(node.right)})`;
    case "call":
      return `(${node.method ? "." : ""}${node.name} ${node.args
        .map(sexpr)
        .join(" ")})`;
    case "member":
      return `(member ${sexpr(node.receiver)} ${node.name})`;
    case "lambda":
      return `(lambda (${node.params.map((param) => param.name).join(" ")}) ${sexpr(node.body)})`;
    case "list":
      return `[${node.items.map(sexpr).join(" ")}]`;
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

  it("parses exponent number literals with exact spans", () => {
    expect(astOf("2.5e-3")).toEqual({
      kind: "literal",
      value: 0.0025,
      position: 0,
      end: 6,
    });
    expect(sexpr(astOf("1E+9"))).toBe("1000000000");
  });

  it("gives keyword literals their token span", () => {
    expect(astOf("true")).toMatchObject({ position: 0, end: 4 });
    expect(astOf("null")).toMatchObject({ position: 0, end: 4 });
  });
});

describe("parse precedence", () => {
  const table: [string, string][] = [
    // v1 rows — semantics unchanged.
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
    // ?? sits below or and associates left.
    ["a ?? b or c", "(coalesce name:a (or name:b name:c))"],
    ["a or b ?? c", "(coalesce (or name:a name:b) name:c)"],
    ["1 ?? 2 ?? 3", "(coalesce (coalesce 1 2) 3)"],
    // ^ binds above unary and associates right.
    ["-2 ^ 2", "(- (pow 2 2))"],
    ["2 ^ 3 ^ 2", "(pow 2 (pow 3 2))"],
    ["2 ^ -3", "(pow 2 (- 3))"],
    ["2 * 3 ^ 2", "(* 2 (pow 3 2))"],
    ["-2 ^ 2 + 1", "(+ (- (pow 2 2)) 1)"],
    ["not 2 ^ 2 == 4", "(== (not (pow 2 2)) 4)"],
    // Postfix method calls bind tighter than everything, spacing-insensitive.
    ["1 + 2 . abs()", "(+ 1 (.abs 2))"],
    ["-2.abs()", "(- (.abs 2))"],
    ["2.abs() ^ 3", "(pow (.abs 2) 3)"],
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

describe("parse name references", () => {
  it("parses a bare identifier as a name with its span", () => {
    expect(astOf("score")).toEqual({
      kind: "name",
      name: "score",
      position: 0,
      end: 5,
    });
  });

  it("parses names inside larger expressions", () => {
    expect(sexpr(astOf("score + 1"))).toBe("(+ name:score 1)");
    expect(sexpr(astOf("a ?? b"))).toBe("(coalesce name:a name:b)");
  });

  it("keeps the name's casing as written", () => {
    expect(astOf("Estimate_2")).toMatchObject({
      kind: "name",
      name: "Estimate_2",
    });
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
    expect(astOf("ROUND(1.5)")).toMatchObject({
      kind: "call",
      name: "ROUND",
      method: false,
    });
  });

  it("parses full expressions as arguments", () => {
    expect(sexpr(astOf("max(1 + 2, 3 * 4)"))).toBe("(max (+ 1 2) (* 3 4))");
  });

  it("spans a call from its name to the closing paren", () => {
    expect(astOf("max(1, 2)")).toMatchObject({ position: 0, end: 9 });
  });

  it("parses let / lets / if / switch as ordinary calls", () => {
    expect(sexpr(astOf("let(x, 1, x + 1)"))).toBe(
      "(let name:x 1 (+ name:x 1))"
    );
    expect(sexpr(astOf("lets(a, 1, b, a + 1, b * 2)"))).toBe(
      "(lets name:a 1 name:b (+ name:a 1) (* name:b 2))"
    );
    expect(sexpr(astOf('switch(thisPage.X, 1, "a", "b")'))).toBe(
      '(switch prop:X 1 "a" "b")'
    );
    expect(astOf("let(x, 1, x)")).toMatchObject({
      kind: "call",
      method: false,
    });
  });

  it("errors on a missing closing paren with position", () => {
    const error = errorOf("round(1.5");
    expect(error.message).toContain('")"');
    expect(error.position).toBe(9);
  });

  it("errors on a trailing comma with the removal hint", () => {
    const error = errorOf("max(1, )");
    expect(error.message).toContain("remove the trailing comma");
    expect(error.position).toBe(5);
  });
});

describe("parse method chains", () => {
  it("parses a method call with the receiver prepended", () => {
    const ast = astOf("prop('x').round(2)");
    expect(sexpr(ast)).toBe("(.round prop:x 2)");
    expect(ast).toMatchObject({ kind: "call", name: "round", method: true });
  });

  it("chains through call results", () => {
    expect(sexpr(astOf('prop("x").round(2).format()'))).toBe(
      "(.format (.round prop:x 2))"
    );
  });

  it("chains onto scope property references", () => {
    const source = "thisPage.Price.round()";
    const ast = astOf(source);
    expect(sexpr(ast)).toBe("(.round prop:Price)");
    expect(ast).toMatchObject({ position: 0, end: source.length });
    expect(formulaNodeChildren(ast)[0]).toMatchObject({
      kind: "property",
      name: "Price",
      position: 0,
      end: "thisPage.Price".length,
    });
  });

  it("chains onto names, calls, lists, and parenthesized expressions", () => {
    expect(sexpr(astOf("a.b(1).c()"))).toBe("(.c (.b name:a 1))");
    expect(sexpr(astOf("[1, 2].length()"))).toBe("(.length [1 2])");
    expect(sexpr(astOf("(1 + 2).abs()"))).toBe("(.abs (+ 1 2))");
  });

  it("chains onto bracket scope references", () => {
    expect(sexpr(astOf('thisPage["Unit Price"].round()'))).toBe(
      "(.round prop:Unit Price)"
    );
  });

  it("spans a method call from the receiver's start", () => {
    const source = "(1 + 2).abs()";
    expect(astOf(source)).toMatchObject({ position: 0, end: source.length });
  });

  it("tolerates spaces around the dot", () => {
    expect(sexpr(astOf("1 + 2 . abs()"))).toBe("(+ 1 (.abs 2))");
  });

  it("requires a function name after the dot", () => {
    const error = errorOf("2 . 5");
    expect(error.message).toContain('Expected a function name after "."');
    expect(error.position).toBe(4);
  });
});

describe("parse member access", () => {
  it("parses a bare member with exact spans", () => {
    expect(astOf("Tasks.Score")).toEqual({
      kind: "member",
      receiver: { kind: "name", name: "Tasks", position: 0, end: 5 },
      name: "Score",
      namePosition: 6,
      position: 0,
      end: 11,
    });
  });

  it("keeps scope references as property nodes, not members", () => {
    expect(astOf("thisPage.X").kind).toBe("property");
    expect(astOf("thisRow.X").kind).toBe("property");
  });

  it("parses members after scope and prop references", () => {
    // The scope root consumes its own `.Price`; the next link is a member.
    expect(sexpr(astOf("thisPage.Owner.Name"))).toBe(
      "(member prop:Owner Name)"
    );
    expect(sexpr(astOf('prop("x").owner.Name'))).toBe(
      "(member (member prop:x owner) Name)"
    );
  });

  it("mixes members and method calls in one chain", () => {
    expect(sexpr(astOf("r.Estimate.round()"))).toBe(
      "(.round (member name:r Estimate))"
    );
    expect(sexpr(astOf("f(x).y"))).toBe("(member (f name:x) y)");
    expect(sexpr(astOf('prop("Rel").map(r => r.Estimate).sum()'))).toBe(
      "(.sum (.map prop:Rel (lambda (r) (member name:r Estimate))))"
    );
  });

  it("spans a member chain from the receiver's start", () => {
    const source = "(1 + 2).digits.first";
    const ast = astOf(source);
    expect(ast).toMatchObject({
      kind: "member",
      name: "first",
      namePosition: source.indexOf("first"),
      position: 0,
      end: source.length,
    });
    if (ast.kind !== "member") {
      throw new Error("expected member");
    }
    expect(ast.receiver).toMatchObject({
      kind: "member",
      name: "digits",
      position: 0,
      end: source.indexOf("digits") + "digits".length,
    });
  });

  it("binds members tighter than operators", () => {
    expect(sexpr(astOf("a.b ^ 2"))).toBe("(pow (member name:a b) 2)");
    expect(sexpr(astOf("-a.b"))).toBe("(- (member name:a b))");
  });

  it("parses long member chains without hitting the depth guard", () => {
    const ast = astOf(`a${".b".repeat(500)}`);
    expect(ast).toMatchObject({ kind: "member", name: "b" });
  });
});

describe("parse bracket member access", () => {
  it("parses to the same member node shape as the dot form", () => {
    const source = 'r["Story Points"]';
    expect(astOf(source)).toEqual({
      kind: "member",
      receiver: { kind: "name", name: "r", position: 0, end: 1 },
      name: "Story Points",
      namePosition: source.indexOf('"Story Points"'),
      position: 0,
      end: source.length,
    });
  });

  it("chains with dot members and method calls", () => {
    expect(sexpr(astOf('r["Story Points"].round()'))).toBe(
      "(.round (member name:r Story Points))"
    );
    expect(sexpr(astOf('prop("Rel").map(r => r["Unit Count"]).sum()'))).toBe(
      "(.sum (.map prop:Rel (lambda (r) (member name:r Unit Count))))"
    );
  });

  it("reports a missing closing bracket at the right spot", () => {
    const error = errorOf('r["Story Points"');
    expect(error.message).toContain("to close the member access");
  });

  it("keeps non-string brackets on their original diagnostics", () => {
    // `f()[0]` was a trailing-token error before bracket members existed and
    // must stay one — only `[` + string literal parses as member access.
    expect(() => errorOf("f()[0]")).not.toThrow();
  });

  it("leaves list literals in argument and primary position untouched", () => {
    expect(sexpr(astOf("[1, 2].sum()"))).toBe("(.sum [1 2])");
    expect(sexpr(astOf("f([1])"))).toBe("(f [1])");
  });
});

describe("parse list literals", () => {
  it("parses items with the full source span", () => {
    const ast = astOf("[1, 2, 3]");
    expect(sexpr(ast)).toBe("[1 2 3]");
    expect(ast).toMatchObject({ kind: "list", position: 0, end: 9 });
  });

  it("parses the empty list", () => {
    expect(astOf("[]")).toEqual({
      kind: "list",
      items: [],
      position: 0,
      end: 2,
    });
  });

  it("parses nested lists and expressions as items", () => {
    expect(sexpr(astOf("[[1], [], 2 + 3]"))).toBe("[[1] [] (+ 2 3)]");
    expect(sexpr(astOf("[x => x]"))).toBe("[(lambda (x) name:x)]");
  });

  it("errors on a trailing comma with the removal hint", () => {
    const error = errorOf("[1, 2,]");
    expect(error.message).toContain("remove the trailing comma");
    expect(error.position).toBe(5);
  });

  it("errors on an unclosed list", () => {
    expect(errorOf("[1, 2").message).toContain("close the list");
  });

  it("errors on a missing comma between items", () => {
    expect(errorOf("[1 2]").message).toContain("close the list");
  });
});

describe("parse lambdas", () => {
  it("parses a single-parameter lambda with spans", () => {
    const source = "x => x + 1";
    const ast = astOf(source);
    expect(sexpr(ast)).toBe("(lambda (x) (+ name:x 1))");
    expect(ast).toMatchObject({
      kind: "lambda",
      params: [{ name: "x", position: 0, end: 1 }],
      position: 0,
      end: source.length,
    });
  });

  it("parses a parenthesized parameter list", () => {
    const source = "(a, b) => a + b";
    const ast = astOf(source);
    expect(sexpr(ast)).toBe("(lambda (a b) (+ name:a name:b))");
    expect(ast).toMatchObject({ position: 0, end: source.length });
    if (ast.kind !== "lambda") {
      throw new Error("expected lambda");
    }
    expect(ast.params).toEqual([
      { name: "a", position: 1, end: 2 },
      { name: "b", position: 4, end: 5 },
    ]);
  });

  it("parses a single parenthesized parameter", () => {
    expect(sexpr(astOf("(x) => x"))).toBe("(lambda (x) name:x)");
  });

  it("nests lambdas through their bodies", () => {
    expect(sexpr(astOf("x => y => x"))).toBe(
      "(lambda (x) (lambda (y) name:x))"
    );
  });

  it("extends the body as far right as possible", () => {
    expect(sexpr(astOf('x => y ?? "fallback"'))).toBe(
      '(lambda (x) (coalesce name:y "fallback"))'
    );
    expect(sexpr(astOf("x => x ^ 2 + 1"))).toBe(
      "(lambda (x) (+ (pow name:x 2) 1))"
    );
    expect(sexpr(astOf("x => x.abs()"))).toBe("(lambda (x) (.abs name:x))");
  });

  it("stops the body at an enclosing call's comma", () => {
    expect(sexpr(astOf("f(x => x, 2)"))).toBe("(f (lambda (x) name:x) 2)");
  });

  it("parses lambdas inside call arguments", () => {
    const source = "filter(items, x => x > 3)";
    const ast = astOf(source);
    expect(sexpr(ast)).toBe("(filter name:items (lambda (x) (> name:x 3)))");
    if (ast.kind !== "call") {
      throw new Error("expected call");
    }
    expect(ast.args[1]).toMatchObject({
      kind: "lambda",
      position: source.indexOf("x =>"),
      end: source.length - 1,
    });
  });

  it("parses a lambda as a coalesce fallback", () => {
    expect(sexpr(astOf("a ?? x => x"))).toBe(
      "(coalesce name:a (lambda (x) name:x))"
    );
  });

  it("rejects duplicate parameter names", () => {
    const error = errorOf("(a, a) => a");
    expect(error.message).toContain('Duplicate parameter name "a"');
    expect(error.position).toBe(4);
  });

  it("rejects a zero-parameter lambda", () => {
    const error = errorOf("() => 1");
    expect(error.message).toContain("at least one parameter");
    expect(error.position).toBe(0);
  });

  it("rejects reserved words as parameter names", () => {
    expect(errorOf("true => 1").message).toContain(
      `"true" is reserved and can't be a parameter name`
    );
    expect(errorOf("(x, or) => x").message).toContain('"or" is reserved');
    expect(errorOf("NULL => 1").message).toContain("reserved");
  });

  it("hints when => has no parameter name in front", () => {
    expect(errorOf("1 => 2")).toEqual({
      message: 'Unexpected "=>" — expected a parameter name before "=>"',
      position: 2,
    });
    expect(errorOf("=> 1").position).toBe(0);
    expect(errorOf("=> 1").message).toContain("parameter name");
    expect(errorOf("(1 + 2) => 3").message).toContain("parameter name");
    expect(errorOf("f(1 => 2)").message).toContain("parameter name");
  });

  it("reports a missing body", () => {
    expect(errorOf("x =>").message).toContain("end of expression");
  });
});

describe("parse spans", () => {
  it("gives literals their exact token span", () => {
    expect(astOf("  42  ")).toMatchObject({ position: 2, end: 4 });
  });

  it("records the operator position on binary nodes", () => {
    expect(astOf("1 + 2")).toMatchObject({
      position: 0,
      end: 5,
      opPosition: 2,
    });
    expect(astOf("a ?? b")).toMatchObject({
      position: 0,
      end: 6,
      opPosition: 2,
    });
  });

  it("includes grouping parens in the enclosing node's span only", () => {
    const source = "(1 + 2) * 3";
    const ast = astOf(source);
    expect(ast).toMatchObject({
      kind: "binary",
      op: "*",
      position: 0,
      end: source.length,
    });
    if (ast.kind !== "binary") {
      throw new Error("expected binary");
    }
    expect(ast.left).toMatchObject({
      kind: "binary",
      op: "+",
      position: 1,
      end: 6,
    });
  });

  it("extends a unary span over a parenthesized operand", () => {
    const ast = astOf("-(1 + 2)");
    expect(ast).toMatchObject({ kind: "unary", position: 0, end: 8 });
    if (ast.kind !== "unary") {
      throw new Error("expected unary");
    }
    expect(ast.operand).toMatchObject({ position: 2, end: 7 });
  });

  it("keeps an inner node's span when parens wrap the whole expression", () => {
    expect(astOf("(thisPage.X)")).toMatchObject({
      kind: "property",
      position: 1,
      end: 11,
    });
  });

  it("spans pow nodes across right-associated chains", () => {
    const source = "2 ^ 3 ^ 2";
    const ast = astOf(source);
    expect(ast).toMatchObject({ position: 0, end: source.length });
    if (ast.kind !== "binary") {
      throw new Error("expected binary");
    }
    expect(ast.right).toMatchObject({ position: 4, end: 9 });
  });

  it("is unaffected by comments and newlines", () => {
    const source = "1 + /* note */ 2";
    expect(astOf(source)).toMatchObject({
      position: 0,
      end: source.length,
      opPosition: 2,
    });
  });
});

describe("parse comments", () => {
  it("parses a multi-line commented formula", () => {
    const source = [
      "// price with tax",
      "round(",
      "  thisPage.Price * 1.1, /* two decimals */ 2",
      ")",
    ].join("\n");
    expect(sexpr(astOf(source))).toBe("(round (* prop:Price 1.1) 2)");
  });

  it("treats comment-only input as empty", () => {
    expect(errorOf("// nothing").message).toBe("Empty expression");
    expect(errorOf("/* nothing */").message).toBe("Empty expression");
  });

  it("surfaces an unterminated block comment", () => {
    expect(errorOf("1 + /* oops")).toEqual({
      message: 'Unterminated block comment — close it with "*/"',
      position: 4,
    });
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

  it("says what is expected after a dangling ^", () => {
    const error = errorOf("2 ^");
    expect(error.message).toContain("expected a value");
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

  it("reports an unmatched closing bracket", () => {
    const error = errorOf("1]");
    expect(error.message).toContain('Unexpected "]"');
    expect(error.position).toBe(1);
  });

  it("reports an unclosed group", () => {
    expect(errorOf("(1 + 2").message).toContain("close the group");
  });

  it("surfaces tokenizer errors through parseFormula", () => {
    expect(errorOf('1 + "oops')).toEqual({
      message: "Unterminated string",
      position: 4,
    });
  });
});

describe("parse guards (depth and length)", () => {
  it("returns a parse error instead of overflowing on deeply nested parens", () => {
    const source = `${"(".repeat(2000)}1${")".repeat(2000)}`;
    expect(errorOf(source).message).toContain("too deeply nested");
  });

  it("returns a parse error instead of overflowing on long unary chains", () => {
    expect(errorOf(`${"-".repeat(5000)}1`).message).toContain(
      "too deeply nested"
    );
    expect(errorOf(`${"!".repeat(5000)}true`).message).toContain(
      "too deeply nested"
    );
  });

  it("returns a parse error instead of overflowing on power chains", () => {
    expect(errorOf(`${"2^".repeat(3000)}2`).message).toContain(
      "too deeply nested"
    );
  });

  it("returns a parse error instead of overflowing on lambda chains", () => {
    expect(errorOf(`${"x => ".repeat(1000)}1`).message).toContain(
      "too deeply nested"
    );
  });

  it("returns a parse error instead of overflowing on nested lists", () => {
    expect(errorOf("[".repeat(2000)).message).toContain("too deeply nested");
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

  it("parses long method chains without hitting the depth guard", () => {
    const source = `1${".abs()".repeat(500)}`;
    const ast = astOf(source);
    expect(ast).toMatchObject({ kind: "call", name: "abs", method: true });
  });
});

describe("walkFormula", () => {
  it("visits nodes pre-order, parents before children", () => {
    const kinds: string[] = [];
    walkFormula(astOf("filter(items, x => x > 3)"), (node) => {
      kinds.push(node.kind);
    });
    expect(kinds).toEqual([
      "call",
      "name",
      "lambda",
      "binary",
      "name",
      "literal",
    ]);
  });

  it("includes a method call's receiver as its first child", () => {
    const kinds: string[] = [];
    walkFormula(astOf("a.b(1)"), (node) => {
      kinds.push(node.kind);
    });
    expect(kinds).toEqual(["call", "name", "literal"]);
  });

  it("walks through a member's receiver", () => {
    const kinds: string[] = [];
    walkFormula(astOf("f(x).y"), (node) => {
      kinds.push(node.kind);
    });
    expect(kinds).toEqual(["member", "call", "name"]);
  });

  it("skips a subtree when the visitor returns false", () => {
    const kinds: string[] = [];
    walkFormula(astOf("filter(items, x => x > 3)"), (node) => {
      kinds.push(node.kind);
      return node.kind !== "lambda";
    });
    expect(kinds).toEqual(["call", "name", "lambda"]);
  });

  it("exposes children in source order", () => {
    const ast = astOf("[1, 2, 3]");
    expect(formulaNodeChildren(ast).map(sexpr)).toEqual(["1", "2", "3"]);
    expect(formulaNodeChildren(astOf("42"))).toEqual([]);
  });
});

describe("v1 golden corpus", () => {
  // The frozen v1 compatibility contract (`corpus.fixture.ts`): every
  // example the retired v1 function catalog documented must keep parsing.
  it("parses every frozen v1 catalog example", () => {
    expect(V1_GOLDEN_CORPUS.length).toBeGreaterThan(20);
    for (const entry of V1_GOLDEN_CORPUS) {
      const result = parseFormula(entry.expression);
      expect(result.ok, `${entry.name}: ${entry.expression}`).toBe(true);
    }
  });

  it("parses corpus examples to a call of the documented function", () => {
    for (const entry of V1_GOLDEN_CORPUS) {
      const ast = astOf(entry.expression);
      let found = false;
      walkFormula(ast, (node) => {
        if (
          node.kind === "call" &&
          node.name.toLowerCase() === entry.name.toLowerCase()
        ) {
          found = true;
        }
      });
      expect(found, `${entry.name}: ${entry.expression}`).toBe(true);
    }
  });

  const corpus: [string, string][] = [
    ["thisPage.Score", "prop:Score"],
    ["thisRow.Score", "prop:Score"],
    ['thisPage["Due Date"]', "prop:Due Date"],
    ["thisRow['A b c']", "prop:A b c"],
    ['prop("f_8a2c")', "prop:f_8a2c"],
    ["now()", "(now )"],
    [
      'if(contains("ab", "a"), 1, round(2.5, 0))',
      '(if (contains "ab" "a") 1 (round 2.5 0))',
    ],
    ["max(1 + 2, 3 * 4)", "(max (+ 1 2) (* 3 4))"],
    ["!true && false || true", "(or (and (not true) false) true)"],
    [
      'concat(thisPage.Name, " — ", thisPage.Status)',
      '(concat prop:Name " — " prop:Status)',
    ],
    ["round(thisPage.Price * 1.1, 2)", "(round (* prop:Price 1.1) 2)"],
    [
      'if(empty(thisPage.Notes), "Todo", "Done")',
      '(if (empty prop:Notes) "Todo" "Done")',
    ],
    ["-thisPage.Price + 100", "(+ (- prop:Price) 100)"],
    [
      "thisPage.Score >= 10 and thisPage.Score < 20",
      "(and (>= prop:Score 10) (< prop:Score 20))",
    ],
  ];
  for (const [source, expected] of corpus) {
    it(`keeps v1 semantics for ${source}`, () => {
      expect(sexpr(astOf(source))).toBe(expected);
    });
  }
});
