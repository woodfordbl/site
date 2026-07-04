/**
 * Advisory type inference for the shared expression language (`lib/expr`). A
 * pure pass over a parsed AST that reports the result type WITHOUT evaluating —
 * used by the formula builder to show a result-type badge and (later) drive
 * type-aware autocomplete. Never throws; anything it cannot pin down is
 * `unknown` (permissive, so it never blocks a formula the evaluator accepts).
 *
 * The evaluator (`evaluate.ts`) remains the source of truth for runtime
 * coercion — this pass is a hint layer, deliberately conservative.
 */

import type { ExprNode } from "@/lib/expr/parse.ts";

/** The surfaced value types. `row` arrives with Phase E (relations). */
export type ExprType =
  | "number"
  | "text"
  | "boolean"
  | "date"
  | "list"
  | "empty"
  | "unknown";

/** Resolves a `thisPage.X` property name to its type (unknown if absent). */
export type ResolvePropertyType = (name: string) => ExprType;

/** Function → result type. Names are lowercased; absent ⇒ `unknown`. */
const FUNCTION_RESULT_TYPES = new Map<string, ExprType>([
  // number
  ...(
    [
      "round",
      "floor",
      "ceil",
      "abs",
      "min",
      "max",
      "sum",
      "average",
      "avg",
      "len",
      "mod",
      "pow",
      "sqrt",
      "clamp",
      "sign",
      "log",
      "log10",
      "exp",
      "roundup",
      "rounddown",
      "roundtomultiple",
      "tonumber",
      "indexof",
      "year",
      "month",
      "day",
      "weekday",
      "count",
      "length",
      "countif",
    ] as const
  ).map((name): [string, ExprType] => [name, "number"]),
  // text
  ...(
    [
      "concat",
      "lower",
      "upper",
      "trim",
      "replace",
      "format",
      "formatdate",
      "substring",
      "padstart",
      "padend",
      "repeat",
      "capitalize",
      "regexextract",
      "regexreplace",
      "dayname",
      "monthname",
      "now",
      "join",
      "currency",
      "percent",
      "compact",
      "formatnumber",
      "fromnow",
      "timeago",
      "totext",
    ] as const
  ).map((name): [string, ExprType] => [name, "text"]),
  // boolean
  ...(
    [
      "contains",
      "empty",
      "isempty",
      "isnotempty",
      "isnumber",
      "istext",
      "isboolean",
      "isdate",
      "xor",
      "startswith",
      "endswith",
      "regexmatch",
      "issameday",
      "includes",
      "some",
      "every",
      "toboolean",
    ] as const
  ).map((name): [string, ExprType] => [name, "boolean"]),
  // date
  ...(["dateadd", "today", "startof", "endof", "todate"] as const).map(
    (name): [string, ExprType] => [name, "date"]
  ),
  // list
  ...(["map", "filter", "unique", "reverse", "slice", "sort"] as const).map(
    (name): [string, ExprType] => [name, "list"]
  ),
]);

/** Names whose result type is the unification of their branch results. */
const BRANCHING_CALLS = new Set(["if", "ifs", "switch"]);

/**
 * Combine two branch types into the type both satisfy: identical types pass
 * through, `empty` (a `null` branch) unifies with any concrete type, and
 * anything else widens to `unknown`.
 */
function unifyTypes(a: ExprType, b: ExprType): ExprType {
  if (a === b) {
    return a;
  }
  if (a === "empty") {
    return b;
  }
  if (b === "empty") {
    return a;
  }
  return "unknown";
}

/** Result types of the branches of `if`/`ifs`/`switch`, unified together. */
function inferBranchResult(
  name: string,
  args: ExprNode[],
  resolve: ResolvePropertyType
): ExprType {
  // if(cond, then, else) → then/else; ifs(c,r,…,default?) and
  // switch(subj,case,result,…,default?) → every result plus any trailing
  // default (the arm shapes differ only in where the results sit).
  const resultNodes: ExprNode[] = [];
  if (name === "if") {
    resultNodes.push(args[1], args[2]);
  } else {
    const start = name === "switch" ? 2 : 1;
    for (let index = start; index < args.length; index += 2) {
      resultNodes.push(args[index]);
    }
    // A trailing arg (odd tail) is the default result.
    const tail = args.length - start;
    const last = args.at(-1);
    if (tail % 2 === 1 && last !== undefined) {
      resultNodes.push(last);
    }
  }
  const present = resultNodes.filter((node): node is ExprNode => node != null);
  if (present.length === 0) {
    return "unknown";
  }
  return present
    .map((node) => inferType(node, resolve))
    .reduce((accumulated, next) => unifyTypes(accumulated, next));
}

function inferBinary(op: string, left: ExprType, right: ExprType): ExprType {
  switch (op) {
    case "-":
    case "*":
    case "/":
    case "%":
      return "number";
    case "+":
      // `+` is string concat when either side is text; numeric otherwise.
      if (left === "text" || right === "text") {
        return "text";
      }
      if (left === "number" && right === "number") {
        return "number";
      }
      return "unknown";
    default:
      // Comparisons, equality, and/or all yield booleans.
      return "boolean";
  }
}

/**
 * Infer the result type of an expression. `resolve` maps property names to
 * their field type; everything the pass cannot determine (variables, unknown
 * functions, incompatible branches) is `unknown`.
 */
export function inferType(
  ast: ExprNode,
  resolve: ResolvePropertyType
): ExprType {
  switch (ast.kind) {
    case "literal": {
      if (ast.value === null) {
        return "empty";
      }
      if (typeof ast.value === "number") {
        return "number";
      }
      if (typeof ast.value === "boolean") {
        return "boolean";
      }
      return "text";
    }
    case "property":
      return resolve(ast.name);
    case "variable":
      // Binding types are not tracked in this pass (kept deliberately simple).
      return "unknown";
    case "unary":
      return ast.op === "not" ? "boolean" : "number";
    case "binary":
      return inferBinary(
        ast.op,
        inferType(ast.left, resolve),
        inferType(ast.right, resolve)
      );
    case "call": {
      const lower = ast.name.toLowerCase();
      if (BRANCHING_CALLS.has(lower)) {
        return inferBranchResult(lower, ast.args, resolve);
      }
      if (lower === "let" || lower === "lets") {
        // The body is the last argument.
        const body = ast.args.at(-1);
        return body === undefined ? "unknown" : inferType(body, resolve);
      }
      return FUNCTION_RESULT_TYPES.get(lower) ?? "unknown";
    }
    case "list":
      return "list";
    default:
      return "unknown";
  }
}
