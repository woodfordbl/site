/**
 * AST for the v2 formula language (`lib/formula`). Every node carries a full
 * source span: `position` is the 0-based index of the node's first character
 * and `end` is exclusive. Grouping parens belong to the *enclosing* node's
 * span, never to the inner node's — in `(1 + 2) * 3` the `*` node spans the
 * whole source while the `+` node spans only `1 + 2`. Editor decorations and
 * checker diagnostics depend on these spans being exact.
 */

/**
 * Binary operators in the AST. `&&`/`||`/`!` normalize to `and`/`or`/`not`
 * at parse time; `??` parses to `coalesce` and `^` to `pow`.
 */
export type FormulaBinaryOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "and"
  | "or"
  | "coalesce"
  | "pow";

/** Unary operators in the AST. `!` normalizes to `not` at parse time. */
export type FormulaUnaryOp = "-" | "not";

/** Literal number/string/boolean/null value. */
export interface FormulaLiteralNode {
  end: number;
  kind: "literal";
  position: number;
  value: number | string | boolean | null;
}

/**
 * Property reference — `thisPage.Name`, `thisRow.Name`, the bracket form
 * `thisPage["Property With Spaces"]`, or the canonical id form
 * `prop("<fieldId>")`. `thisPage` and `thisRow` are synonyms for the same
 * scope, so the AST keeps only the raw reference string (`name`). `via`
 * records how the reference was written so source rewriters can translate
 * between the two spellings.
 */
export interface FormulaPropertyNode {
  end: number;
  kind: "property";
  name: string;
  position: number;
  via: "prop" | "scope";
}

/**
 * Whole-database reference — `db("<databaseId>")`. Canonical stored text
 * holds the database ID (stable across renames, mirroring `prop`); the
 * display form holds the database NAME (`db("Enrollments")`), translated by
 * the ref rewriters. The AST keeps only the raw string (`databaseId`) —
 * whether it names a real database is the checker/evaluator's concern.
 * `idPosition`/`idEnd` span the quoted string literal so diagnostics can
 * point at the reference itself rather than the whole `db(…)` call.
 */
export interface FormulaDatabaseNode {
  /** Raw string argument: a database id (canonical) or name (display form). */
  databaseId: string;
  end: number;
  /** End (exclusive) of the quoted string literal, including its quotes. */
  idEnd: number;
  /** Start of the quoted string literal, including its opening quote. */
  idPosition: number;
  kind: "database";
  position: number;
}

/**
 * Bare identifier used as a name reference — a lambda parameter or a
 * `let`/`lets` binding. The parser is permissive: whether the name actually
 * resolves to a binding is the checker/evaluator's concern.
 */
export interface FormulaNameNode {
  end: number;
  kind: "name";
  name: string;
  position: number;
}

/** Unary operation (numeric negation or boolean `not`). */
export interface FormulaUnaryNode {
  end: number;
  kind: "unary";
  op: FormulaUnaryOp;
  operand: FormulaNode;
  position: number;
}

/**
 * Binary operation, including short-circuiting `and`/`or` and
 * blank-coalescing `coalesce` (`??`). `opPosition` is the 0-based index of
 * the operator lexeme so diagnostics can point at the operator itself rather
 * than the whole expression.
 */
export interface FormulaBinaryNode {
  end: number;
  kind: "binary";
  left: FormulaNode;
  op: FormulaBinaryOp;
  opPosition: number;
  position: number;
  right: FormulaNode;
}

/**
 * Function call. `name` is stored as written; lookup at evaluation time is
 * case-insensitive. A dot-chained call `expr.fn(a)` parses to the same node
 * as `fn(expr, a)` with the receiver prepended to `args` and `method: true`,
 * so rewriters can print the chain back in its original shape. `let`, `lets`,
 * `if`, and `switch` are ordinary calls — binding and branching semantics
 * live in the checker/evaluator, not the grammar.
 */
export interface FormulaCallNode {
  args: FormulaNode[];
  end: number;
  kind: "call";
  method: boolean;
  name: string;
  position: number;
}

/**
 * Postfix member access without a call — `r.Estimate` inside a relation
 * traversal, or `prop("x").owner`. `namePosition` is the 0-based index of
 * the member identifier; `position` starts at the receiver so the span
 * covers the whole chain (matching method-call spans). Whether the member
 * exists on the receiver's type is the checker's concern, not the grammar's.
 * Scope references are not members: `thisPage.X` parses to a property node.
 */
export interface FormulaMemberNode {
  end: number;
  kind: "member";
  name: string;
  namePosition: number;
  position: number;
  receiver: FormulaNode;
}

/** One lambda parameter: a bare identifier with its source span. */
export interface FormulaLambdaParam {
  end: number;
  name: string;
  position: number;
}

/**
 * Lambda expression — `x => expr` or `(a, b) => expr`. The body extends as
 * far right as possible, like a JS arrow function. Lambdas parse anywhere an
 * expression may appear; the checker restricts placement later.
 */
export interface FormulaLambdaNode {
  body: FormulaNode;
  end: number;
  kind: "lambda";
  params: FormulaLambdaParam[];
  position: number;
}

/** List literal — `[a, b, c]` or the empty `[]`. */
export interface FormulaListNode {
  end: number;
  items: FormulaNode[];
  kind: "list";
  position: number;
}

/** Any formula AST node. */
export type FormulaNode =
  | FormulaLiteralNode
  | FormulaPropertyNode
  | FormulaDatabaseNode
  | FormulaNameNode
  | FormulaUnaryNode
  | FormulaBinaryNode
  | FormulaCallNode
  | FormulaMemberNode
  | FormulaLambdaNode
  | FormulaListNode;

/**
 * Direct children of a node in source order. A method call's receiver is its
 * first argument; lambda parameters are not nodes and are not included.
 */
export function formulaNodeChildren(node: FormulaNode): readonly FormulaNode[] {
  switch (node.kind) {
    case "literal":
    case "property":
    case "database":
    case "name":
      return [];
    case "unary":
      return [node.operand];
    case "binary":
      return [node.left, node.right];
    case "call":
      return node.args;
    case "member":
      return [node.receiver];
    case "lambda":
      return [node.body];
    case "list":
      return node.items;
    default:
      return [];
  }
}

/**
 * Pre-order walk over a formula AST. `visit` runs for every node, parents
 * before children; returning exactly `false` skips that node's children.
 * Plain recursion is safe here: the parser's depth guard bounds the depth of
 * any tree it produces.
 */
export function walkFormula(
  root: FormulaNode,
  visit: (node: FormulaNode) => unknown
): void {
  if (visit(root) === false) {
    return;
  }
  for (const child of formulaNodeChildren(root)) {
    walkFormula(child, visit);
  }
}
