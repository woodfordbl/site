/**
 * Recursive-descent parser for the shared expression language (`lib/expr`).
 * Turns a source string into a typed AST with conventional precedence:
 * `or` < `and` < `==`/`!=` < `<`/`<=`/`>`/`>=` < `+`/`-` < `*`/`/`/`%` <
 * unary `-`/`not` < primary. Parse failures are returned as a Result — never
 * thrown to callers.
 */

import {
  type ExprPunct,
  type ExprSourceError,
  type ExprToken,
  tokenize,
} from "@/lib/expr/tokenize.ts";

/** Binary operators in the AST. `&&`/`||` normalize to `and`/`or` at parse time. */
export type ExprBinaryOp =
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
  | "or";

/** Unary operators in the AST. `!` normalizes to `not` at parse time. */
export type ExprUnaryOp = "-" | "not";

/** Literal number/string/boolean/null value. */
export interface ExprLiteralNode {
  kind: "literal";
  position: number;
  value: number | string | boolean | null;
}

/**
 * Property reference — `thisPage.Name`, `thisRow.Name`, or the bracket form
 * `thisPage["Property With Spaces"]`. `thisPage` and `thisRow` are synonyms
 * for the same scope, so the AST keeps only the property name; resolution
 * against a scope is by field name (case-insensitive, trimmed).
 */
export interface ExprPropertyNode {
  kind: "property";
  name: string;
  position: number;
}

/** Unary operation (numeric negation or boolean `not`). */
export interface ExprUnaryNode {
  kind: "unary";
  op: ExprUnaryOp;
  operand: ExprNode;
  position: number;
}

/** Binary operation, including short-circuiting `and`/`or`. */
export interface ExprBinaryNode {
  kind: "binary";
  left: ExprNode;
  op: ExprBinaryOp;
  position: number;
  right: ExprNode;
}

/**
 * Function call. `name` is stored as written; lookup at evaluation time is
 * case-insensitive.
 */
export interface ExprCallNode {
  args: ExprNode[];
  kind: "call";
  name: string;
  position: number;
}

/** Any expression AST node. */
export type ExprNode =
  | ExprLiteralNode
  | ExprPropertyNode
  | ExprUnaryNode
  | ExprBinaryNode
  | ExprCallNode;

/** Result of {@link parseExpression}: the AST or a positioned parse error. */
export type ParseExpressionResult =
  | { ok: true; ast: ExprNode }
  | { ok: false; error: ExprSourceError };

/** Scope roots accepted before `.property` / `["property"]` (lowercased). */
const SCOPE_ROOTS = new Set(["thispage", "thisrow"]);

/**
 * Longest accepted expression source, in characters. Longer input becomes a
 * parse error instead of feeding the tokenizer/parser pathological data.
 */
export const MAX_EXPRESSION_LENGTH = 10_000;

/**
 * Deepest accepted grammar nesting. The recursive-descent parser would blow
 * the JS call stack on deeply nested input (~2k nested parens), and the
 * resulting RangeError would escape {@link parseExpression}'s never-throws
 * contract. Because every AST level costs at least one counted parser
 * recursion, this cap also bounds AST depth — so the recursive evaluator in
 * `evaluate.ts` (and `isVolatileExpression`) can never overflow on a parsed
 * tree either.
 */
const MAX_PARSE_DEPTH = 100;

/** Internal control-flow error carrying the source position; never escapes. */
class ExprParseFailure extends Error {
  readonly position: number;

  constructor(message: string, position: number) {
    super(message);
    this.name = "ExprParseFailure";
    this.position = position;
  }
}

class Parser {
  private readonly tokens: ExprToken[];
  private index = 0;
  private depth = 0;

  constructor(tokens: ExprToken[]) {
    this.tokens = tokens;
  }

  /**
   * Run one recursive production with the nesting counter bumped, failing
   * with a positioned parse error past {@link MAX_PARSE_DEPTH}. Guards the
   * two recursion points ({@link parseOr}, {@link parseUnary}) so nesting is
   * bounded regardless of which grammar path recursion takes.
   */
  private withDepth(body: () => ExprNode): ExprNode {
    this.depth += 1;
    try {
      if (this.depth > MAX_PARSE_DEPTH) {
        throw new ExprParseFailure(
          "Expression too deeply nested",
          this.peek().position
        );
      }
      return body();
    } finally {
      this.depth -= 1;
    }
  }

  parse(): ExprNode {
    const first = this.peek();
    if (first.type === "eof") {
      throw new ExprParseFailure("Empty expression", first.position);
    }
    const ast = this.parseOr();
    const trailing = this.peek();
    if (trailing.type !== "eof") {
      throw new ExprParseFailure(
        `Unexpected ${describeToken(trailing)}`,
        trailing.position
      );
    }
    return ast;
  }

  private peek(): ExprToken {
    return this.tokens[this.index];
  }

  private advance(): ExprToken {
    const token = this.tokens[this.index];
    if (token.type !== "eof") {
      this.index += 1;
    }
    return token;
  }

  private matchPunct(value: ExprPunct): ExprToken | null {
    const token = this.peek();
    if (token.type === "punct" && token.value === value) {
      return this.advance();
    }
    return null;
  }

  private matchKeyword(word: string): ExprToken | null {
    const token = this.peek();
    if (token.type === "identifier" && token.value.toLowerCase() === word) {
      return this.advance();
    }
    return null;
  }

  private expectPunct(value: ExprPunct, context: string): ExprToken {
    const token = this.matchPunct(value);
    if (token === null) {
      const found = this.peek();
      throw new ExprParseFailure(
        `Expected "${value}" ${context}, got ${describeToken(found)}`,
        found.position
      );
    }
    return token;
  }

  private parseOr(): ExprNode {
    return this.withDepth(() => {
      let left = this.parseAnd();
      for (;;) {
        const op = this.matchKeyword("or") ?? this.matchPunct("||");
        if (op === null) {
          return left;
        }
        const right = this.parseAnd();
        left = { kind: "binary", op: "or", left, right, position: op.position };
      }
    });
  }

  private parseAnd(): ExprNode {
    let left = this.parseEquality();
    for (;;) {
      const op = this.matchKeyword("and") ?? this.matchPunct("&&");
      if (op === null) {
        return left;
      }
      const right = this.parseEquality();
      left = { kind: "binary", op: "and", left, right, position: op.position };
    }
  }

  private parseEquality(): ExprNode {
    let left = this.parseRelational();
    for (;;) {
      const op = this.matchPunct("==") ?? this.matchPunct("!=");
      if (op === null || op.type !== "punct") {
        return left;
      }
      const right = this.parseRelational();
      left = {
        kind: "binary",
        op: op.value as ExprBinaryOp,
        left,
        right,
        position: op.position,
      };
    }
  }

  private parseRelational(): ExprNode {
    let left = this.parseAdditive();
    for (;;) {
      const op =
        this.matchPunct("<=") ??
        this.matchPunct(">=") ??
        this.matchPunct("<") ??
        this.matchPunct(">");
      if (op === null || op.type !== "punct") {
        return left;
      }
      const right = this.parseAdditive();
      left = {
        kind: "binary",
        op: op.value as ExprBinaryOp,
        left,
        right,
        position: op.position,
      };
    }
  }

  private parseAdditive(): ExprNode {
    let left = this.parseMultiplicative();
    for (;;) {
      const op = this.matchPunct("+") ?? this.matchPunct("-");
      if (op === null || op.type !== "punct") {
        return left;
      }
      const right = this.parseMultiplicative();
      left = {
        kind: "binary",
        op: op.value as ExprBinaryOp,
        left,
        right,
        position: op.position,
      };
    }
  }

  private parseMultiplicative(): ExprNode {
    let left = this.parseUnary();
    for (;;) {
      const op =
        this.matchPunct("*") ?? this.matchPunct("/") ?? this.matchPunct("%");
      if (op === null || op.type !== "punct") {
        return left;
      }
      const right = this.parseUnary();
      left = {
        kind: "binary",
        op: op.value as ExprBinaryOp,
        left,
        right,
        position: op.position,
      };
    }
  }

  private parseUnary(): ExprNode {
    return this.withDepth(() => {
      const negate = this.matchPunct("-");
      if (negate !== null) {
        return {
          kind: "unary",
          op: "-",
          operand: this.parseUnary(),
          position: negate.position,
        };
      }
      const not = this.matchKeyword("not") ?? this.matchPunct("!");
      if (not !== null) {
        return {
          kind: "unary",
          op: "not",
          operand: this.parseUnary(),
          position: not.position,
        };
      }
      return this.parsePrimary();
    });
  }

  private parsePrimary(): ExprNode {
    const token = this.peek();
    if (token.type === "number" || token.type === "string") {
      this.advance();
      return { kind: "literal", value: token.value, position: token.position };
    }
    if (token.type === "identifier") {
      return this.parseIdentifier();
    }
    if (token.type === "punct" && token.value === "(") {
      this.advance();
      const inner = this.parseOr();
      this.expectPunct(")", "to close the group");
      return inner;
    }
    throw new ExprParseFailure(
      `Unexpected ${describeToken(token)}`,
      token.position
    );
  }

  private parseIdentifier(): ExprNode {
    const token = this.advance();
    if (token.type !== "identifier") {
      throw new ExprParseFailure(
        `Unexpected ${describeToken(token)}`,
        token.position
      );
    }
    const lower = token.value.toLowerCase();
    if (lower === "true" || lower === "false") {
      return {
        kind: "literal",
        value: lower === "true",
        position: token.position,
      };
    }
    if (lower === "null") {
      return { kind: "literal", value: null, position: token.position };
    }
    if (SCOPE_ROOTS.has(lower)) {
      return this.parsePropertyAccess(token.value, token.position);
    }
    if (this.matchPunct("(") !== null) {
      return this.parseCallArgs(token.value, token.position);
    }
    throw new ExprParseFailure(
      `Unknown identifier "${token.value}" — expected thisPage.<property>, a function call, or a literal`,
      token.position
    );
  }

  private parsePropertyAccess(root: string, position: number): ExprNode {
    if (this.matchPunct(".") !== null) {
      const name = this.peek();
      if (name.type !== "identifier") {
        throw new ExprParseFailure(
          `Expected a property name after "${root}."`,
          name.position
        );
      }
      this.advance();
      return { kind: "property", name: name.value, position };
    }
    if (this.matchPunct("[") !== null) {
      const name = this.peek();
      if (name.type !== "string") {
        throw new ExprParseFailure(
          `Expected a quoted property name inside "${root}[…]"`,
          name.position
        );
      }
      this.advance();
      this.expectPunct("]", "to close the property access");
      return { kind: "property", name: name.value, position };
    }
    const found = this.peek();
    throw new ExprParseFailure(
      `Expected "." or "[" after "${root}"`,
      found.position
    );
  }

  private parseCallArgs(name: string, position: number): ExprNode {
    const args: ExprNode[] = [];
    if (this.matchPunct(")") !== null) {
      return { kind: "call", name, args, position };
    }
    for (;;) {
      args.push(this.parseOr());
      if (this.matchPunct(",") !== null) {
        continue;
      }
      this.expectPunct(")", `to close the "${name}(…)" call`);
      return { kind: "call", name, args, position };
    }
  }
}

function describeToken(token: ExprToken): string {
  switch (token.type) {
    case "eof":
      return "end of expression";
    case "number":
      return `number ${token.value}`;
    case "string":
      return `string "${token.value}"`;
    case "identifier":
      return `"${token.value}"`;
    case "punct":
      return `"${token.value}"`;
    default:
      return "token";
  }
}

/**
 * Parse an expression source string into an AST. Never throws: lexical and
 * syntactic problems come back as `{ ok: false, error: { message, position } }`
 * with a 0-based character position into `source`.
 */
export function parseExpression(source: string): ParseExpressionResult {
  if (source.length > MAX_EXPRESSION_LENGTH) {
    return {
      ok: false,
      error: {
        message: `Expression too long (max ${MAX_EXPRESSION_LENGTH} characters)`,
        position: 0,
      },
    };
  }
  const lexed = tokenize(source);
  if (!lexed.ok) {
    return { ok: false, error: lexed.error };
  }
  try {
    return { ok: true, ast: new Parser(lexed.tokens).parse() };
  } catch (error) {
    if (error instanceof ExprParseFailure) {
      return {
        ok: false,
        error: { message: error.message, position: error.position },
      };
    }
    throw error;
  }
}
