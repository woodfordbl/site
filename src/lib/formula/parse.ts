/**
 * Recursive-descent parser for the v2 formula language (`lib/formula`).
 * Turns a source string into a typed AST with conventional precedence:
 * `??` < `or` < `and` < `==`/`!=` < `<`/`<=`/`>`/`>=` < `+`/`-` <
 * `*`/`/`/`%` < unary `-`/`not` < `^` (right-associative) < postfix
 * `.name` / `.fn(…)` < primary. Parse failures are returned as a Result —
 * never thrown to callers.
 *
 * Everything the retired v1 grammar accepted stays valid and
 * parses to equivalent shapes; new here are comments, exponent literals,
 * `??`/`^`, list literals, lambdas, bare-identifier name references, and
 * dot-chained member access and method calls.
 */

import type {
  FormulaBinaryOp,
  FormulaLambdaNode,
  FormulaLambdaParam,
  FormulaNode,
} from "@/lib/formula/ast.ts";
import {
  type FormulaPunct,
  type FormulaSourceError,
  type FormulaToken,
  tokenizeFormula,
} from "@/lib/formula/tokenize.ts";

/** Result of {@link parseFormula}: the AST or a positioned parse error. */
export type ParseFormulaResult =
  | { ok: true; ast: FormulaNode }
  | { ok: false; error: FormulaSourceError };

/**
 * Scope roots accepted before `.property` / `["property"]` (lowercased).
 * Exported so the editor highlighter classifies references off the same list.
 */
export const FORMULA_SCOPE_ROOTS: ReadonlySet<string> = new Set([
  "thispage",
  "thisrow",
]);

/**
 * The canonical reference form `prop("<fieldId>")` (lowercased). Syntax, not
 * a catalog function — it parses straight to a property node, so it never
 * appears in the function catalog or the UI. Exported for the highlighter.
 */
export const FORMULA_PROP_ROOT = "prop";

/**
 * Words that read as literals or operators and therefore can't name a lambda
 * parameter (lowercased; identifier keywords are case-insensitive).
 */
const RESERVED_WORDS = new Set(["true", "false", "null", "and", "or", "not"]);

/**
 * Longest accepted formula source, in characters. Longer input becomes a
 * parse error instead of feeding the tokenizer/parser pathological data.
 */
export const MAX_EXPRESSION_LENGTH = 10_000;

/**
 * Deepest accepted grammar nesting. The recursive-descent parser would blow
 * the JS call stack on deeply nested input (~2k nested parens), and the
 * resulting RangeError would escape {@link parseFormula}'s never-throws
 * contract. Because every AST level costs at least one counted parser
 * recursion, this cap also bounds AST depth — so recursive consumers of the
 * tree (evaluator, checker, {@link walkFormula}) can never overflow on a
 * parsed tree either.
 */
const MAX_PARSE_DEPTH = 100;

/** Internal control-flow error carrying the source position; never escapes. */
class FormulaParseFailure extends Error {
  readonly position: number;

  constructor(message: string, position: number) {
    super(message);
    this.name = "FormulaParseFailure";
    this.position = position;
  }
}

/** A matched binary operator: the AST op plus the lexeme's token. */
interface MatchedBinaryOp {
  op: FormulaBinaryOp;
  token: FormulaToken;
}

class Parser {
  private readonly tokens: FormulaToken[];
  private index = 0;
  private depth = 0;
  /**
   * End offset (exclusive) of the most recently consumed token. Parent nodes
   * read it after parsing a child so their spans include grouping parens the
   * child node's own span excludes (`-(1 + 2)` spans 0..7; the `+` node
   * spans 2..5).
   */
  private lastEnd = 0;

  constructor(tokens: FormulaToken[]) {
    this.tokens = tokens;
  }

  /**
   * Run one recursive production with the nesting counter bumped, failing
   * with a positioned parse error past {@link MAX_PARSE_DEPTH}. Guards the
   * two recursion points ({@link parseExpression}, {@link parseUnary}) so
   * nesting is bounded regardless of which grammar path recursion takes.
   */
  private withDepth(body: () => FormulaNode): FormulaNode {
    this.depth += 1;
    try {
      if (this.depth > MAX_PARSE_DEPTH) {
        throw new FormulaParseFailure(
          "Expression too deeply nested",
          this.peek().position
        );
      }
      return body();
    } finally {
      this.depth -= 1;
    }
  }

  parse(): FormulaNode {
    const first = this.peek();
    if (first.type === "eof") {
      throw new FormulaParseFailure("Empty expression", first.position);
    }
    const ast = this.parseExpression();
    const trailing = this.peek();
    if (trailing.type !== "eof") {
      throw this.unexpectedToken(trailing);
    }
    return ast;
  }

  private peek(): FormulaToken {
    return this.tokens[this.index];
  }

  private advance(): FormulaToken {
    const token = this.tokens[this.index];
    if (token.type !== "eof") {
      this.index += 1;
      this.lastEnd = token.end;
    }
    return token;
  }

  private peekIsPunct(value: FormulaPunct): boolean {
    const token = this.peek();
    return token.type === "punct" && token.value === value;
  }

  /** The punct value at an absolute token index, for multi-token lookahead. */
  private punctAtIndex(index: number): FormulaPunct | null {
    const token = this.tokens[index];
    return token?.type === "punct" ? token.value : null;
  }

  private matchPunct(value: FormulaPunct): FormulaToken | null {
    if (this.peekIsPunct(value)) {
      return this.advance();
    }
    return null;
  }

  private matchKeyword(word: string): FormulaToken | null {
    const token = this.peek();
    if (token.type === "identifier" && token.value.toLowerCase() === word) {
      return this.advance();
    }
    return null;
  }

  private expectPunct(value: FormulaPunct, context: string): FormulaToken {
    const token = this.matchPunct(value);
    if (token === null) {
      const found = this.peek();
      if (found.type === "punct" && found.value === "=>") {
        throw this.unexpectedToken(found);
      }
      throw new FormulaParseFailure(
        `Expected "${value}" ${context}, got ${describeToken(found)}`,
        found.position
      );
    }
    return token;
  }

  /**
   * Positioned failure for a token no production expected, with targeted
   * hints for the two commonest slips: input that stops mid-expression and a
   * `=>` with no parameter list in front of it.
   */
  private unexpectedToken(token: FormulaToken): FormulaParseFailure {
    if (token.type === "eof") {
      return new FormulaParseFailure(
        "Unexpected end of expression — expected a value",
        token.position
      );
    }
    if (token.type === "punct" && token.value === "=>") {
      return new FormulaParseFailure(
        'Unexpected "=>" — expected a parameter name before "=>"',
        token.position
      );
    }
    return new FormulaParseFailure(
      `Unexpected ${describeToken(token)}`,
      token.position
    );
  }

  /** Top of the precedence ladder; the depth-counted recursion entry point. */
  private parseExpression(): FormulaNode {
    return this.withDepth(() => this.parseCoalesce());
  }

  /**
   * One left-associative binary tier: parse a left operand, then fold
   * `op right` pairs while `matchOp` keeps matching. Node spans start at the
   * tier's first token so parens around the left operand are included.
   */
  private parseBinaryTier(
    operand: () => FormulaNode,
    matchOp: () => MatchedBinaryOp | null
  ): FormulaNode {
    const start = this.peek().position;
    let left = operand();
    for (;;) {
      const matched = matchOp();
      if (matched === null) {
        return left;
      }
      const right = operand();
      left = {
        kind: "binary",
        op: matched.op,
        left,
        right,
        opPosition: matched.token.position,
        position: start,
        end: this.lastEnd,
      };
    }
  }

  /** Match one of several puncts whose lexeme doubles as its AST op. */
  private matchOpPunct(
    values: readonly (FormulaPunct & FormulaBinaryOp)[]
  ): MatchedBinaryOp | null {
    for (const value of values) {
      const token = this.matchPunct(value);
      if (token !== null) {
        return { op: value, token };
      }
    }
    return null;
  }

  private parseCoalesce(): FormulaNode {
    return this.parseBinaryTier(
      () => this.parseOr(),
      () => {
        const token = this.matchPunct("??");
        return token === null ? null : { op: "coalesce", token };
      }
    );
  }

  private parseOr(): FormulaNode {
    return this.parseBinaryTier(
      () => this.parseAnd(),
      () => {
        const token = this.matchKeyword("or") ?? this.matchPunct("||");
        return token === null ? null : { op: "or", token };
      }
    );
  }

  private parseAnd(): FormulaNode {
    return this.parseBinaryTier(
      () => this.parseEquality(),
      () => {
        const token = this.matchKeyword("and") ?? this.matchPunct("&&");
        return token === null ? null : { op: "and", token };
      }
    );
  }

  private parseEquality(): FormulaNode {
    return this.parseBinaryTier(
      () => this.parseRelational(),
      () => this.matchOpPunct(["==", "!="])
    );
  }

  private parseRelational(): FormulaNode {
    return this.parseBinaryTier(
      () => this.parseAdditive(),
      () => this.matchOpPunct(["<=", ">=", "<", ">"])
    );
  }

  private parseAdditive(): FormulaNode {
    return this.parseBinaryTier(
      () => this.parseMultiplicative(),
      () => this.matchOpPunct(["+", "-"])
    );
  }

  private parseMultiplicative(): FormulaNode {
    return this.parseBinaryTier(
      () => this.parseUnary(),
      () => this.matchOpPunct(["*", "/", "%"])
    );
  }

  private parseUnary(): FormulaNode {
    return this.withDepth(() => {
      const negate = this.matchPunct("-");
      if (negate !== null) {
        return {
          kind: "unary",
          op: "-",
          operand: this.parseUnary(),
          position: negate.position,
          end: this.lastEnd,
        };
      }
      const not = this.matchKeyword("not") ?? this.matchPunct("!");
      if (not !== null) {
        return {
          kind: "unary",
          op: "not",
          operand: this.parseUnary(),
          position: not.position,
          end: this.lastEnd,
        };
      }
      return this.parsePower();
    });
  }

  /**
   * `^` binds tighter than unary (`-2 ^ 2` is `-(2 ^ 2)`) and associates to
   * the right (`2 ^ 3 ^ 2` is `2 ^ (3 ^ 2)`). The right operand re-enters
   * {@link parseUnary} so both associativity and `2 ^ -3` fall out.
   */
  private parsePower(): FormulaNode {
    const start = this.peek().position;
    const left = this.parsePostfix();
    const op = this.matchPunct("^");
    if (op === null) {
      return left;
    }
    const right = this.parseUnary();
    return {
      kind: "binary",
      op: "pow",
      left,
      right,
      opPosition: op.position,
      position: start,
      end: this.lastEnd,
    };
  }

  /**
   * Postfix dot-chaining. `expr.fn(a)` parses as `fn(expr, a)` flagged
   * `method`; `expr.Name` without a call parses to a member node. Chains
   * compose left-to-right: `prop("x").owner.Name`, `r.Estimate.round()`.
   */
  private parsePostfix(): FormulaNode {
    const start = this.peek().position;
    let node = this.parsePrimary();
    while (this.matchPunct(".") !== null) {
      node = this.parseMemberOrMethodCall(node, start);
    }
    return node;
  }

  private parseMemberOrMethodCall(
    receiver: FormulaNode,
    start: number
  ): FormulaNode {
    const name = this.peek();
    if (name.type !== "identifier") {
      throw new FormulaParseFailure(
        'Expected a function name after "."',
        name.position
      );
    }
    this.advance();
    if (this.matchPunct("(") === null) {
      return {
        kind: "member",
        receiver,
        name: name.value,
        namePosition: name.position,
        position: start,
        end: name.end,
      };
    }
    const args = this.parseArguments(name.value);
    return {
      kind: "call",
      name: name.value,
      args: [receiver, ...args],
      method: true,
      position: start,
      end: this.lastEnd,
    };
  }

  private parsePrimary(): FormulaNode {
    const token = this.peek();
    if (token.type === "number" || token.type === "string") {
      this.advance();
      return {
        kind: "literal",
        value: token.value,
        position: token.position,
        end: token.end,
      };
    }
    if (token.type === "identifier") {
      return this.parseIdentifier();
    }
    if (token.type === "punct" && token.value === "(") {
      return this.parseGroupOrLambda();
    }
    if (token.type === "punct" && token.value === "[") {
      return this.parseListLiteral();
    }
    throw this.unexpectedToken(token);
  }

  private parseIdentifier(): FormulaNode {
    const token = this.advance();
    if (token.type !== "identifier") {
      throw this.unexpectedToken(token);
    }
    if (this.peekIsPunct("=>")) {
      return this.parseLambdaBody([this.toLambdaParam(token)], token.position);
    }
    const lower = token.value.toLowerCase();
    if (lower === "true" || lower === "false") {
      return {
        kind: "literal",
        value: lower === "true",
        position: token.position,
        end: token.end,
      };
    }
    if (lower === "null") {
      return {
        kind: "literal",
        value: null,
        position: token.position,
        end: token.end,
      };
    }
    if (FORMULA_SCOPE_ROOTS.has(lower)) {
      return this.parsePropertyAccess(token.value, token.position);
    }
    if (lower === FORMULA_PROP_ROOT) {
      return this.parsePropReference(token.position);
    }
    if (this.matchPunct("(") !== null) {
      return {
        kind: "call",
        name: token.value,
        args: this.parseArguments(token.value),
        method: false,
        position: token.position,
        end: this.lastEnd,
      };
    }
    return {
      kind: "name",
      name: token.value,
      position: token.position,
      end: token.end,
    };
  }

  private parsePropertyAccess(root: string, position: number): FormulaNode {
    if (this.matchPunct(".") !== null) {
      const name = this.peek();
      if (name.type !== "identifier") {
        throw new FormulaParseFailure(
          `Expected a property name after "${root}."`,
          name.position
        );
      }
      this.advance();
      return {
        kind: "property",
        name: name.value,
        position,
        end: name.end,
        via: "scope",
      };
    }
    if (this.matchPunct("[") !== null) {
      const name = this.peek();
      if (name.type !== "string") {
        throw new FormulaParseFailure(
          `Expected a quoted property name inside "${root}[…]"`,
          name.position
        );
      }
      this.advance();
      const close = this.expectPunct("]", "to close the property access");
      return {
        kind: "property",
        name: name.value,
        position,
        end: close.end,
        via: "scope",
      };
    }
    const found = this.peek();
    throw new FormulaParseFailure(
      `Expected "." or "[" after "${root}"`,
      found.position
    );
  }

  private parsePropReference(position: number): FormulaNode {
    this.expectPunct("(", 'to open the "prop(…)" reference');
    const name = this.peek();
    if (name.type !== "string") {
      throw new FormulaParseFailure(
        `prop() expects one quoted field id, like prop("abc123") — got ${describeToken(name)}`,
        name.position
      );
    }
    this.advance();
    const comma = this.matchPunct(",");
    if (comma !== null) {
      throw new FormulaParseFailure(
        "prop() expects exactly one quoted field id",
        comma.position
      );
    }
    const close = this.expectPunct(")", 'to close the "prop(…)" reference');
    return {
      kind: "property",
      name: name.value,
      position,
      end: close.end,
      via: "prop",
    };
  }

  /**
   * A `(` opens either a grouped expression or a parenthesized lambda head;
   * a token lookahead over `( name (, name)* ) =>` decides without
   * consuming anything.
   */
  private parseGroupOrLambda(): FormulaNode {
    if (this.isParenLambdaHead()) {
      return this.parseParenLambda();
    }
    const open = this.advance();
    if (this.peekIsPunct(")") && this.punctAtIndex(this.index + 1) === "=>") {
      throw new FormulaParseFailure(
        'A lambda needs at least one parameter before "=>"',
        open.position
      );
    }
    const inner = this.parseExpression();
    this.expectPunct(")", "to close the group");
    return inner;
  }

  /** True when the upcoming tokens read `( name (, name)* ) =>`. */
  private isParenLambdaHead(): boolean {
    let cursor = this.index + 1;
    if (this.tokens[cursor]?.type !== "identifier") {
      return false;
    }
    cursor += 1;
    while (this.punctAtIndex(cursor) === ",") {
      cursor += 1;
      if (this.tokens[cursor]?.type !== "identifier") {
        return false;
      }
      cursor += 1;
    }
    if (this.punctAtIndex(cursor) !== ")") {
      return false;
    }
    return this.punctAtIndex(cursor + 1) === "=>";
  }

  private parseParenLambda(): FormulaNode {
    const open = this.advance();
    const params: FormulaLambdaParam[] = [];
    for (;;) {
      const param = this.toLambdaParam(this.advance());
      if (params.some((existing) => existing.name === param.name)) {
        throw new FormulaParseFailure(
          `Duplicate parameter name "${param.name}"`,
          param.position
        );
      }
      params.push(param);
      if (this.matchPunct(",") === null) {
        break;
      }
    }
    this.expectPunct(")", "to close the parameter list");
    return this.parseLambdaBody(params, open.position);
  }

  /** Validate a parameter token; reserved words can't shadow literals/operators. */
  private toLambdaParam(token: FormulaToken): FormulaLambdaParam {
    if (token.type !== "identifier") {
      throw new FormulaParseFailure(
        `Expected a parameter name, got ${describeToken(token)}`,
        token.position
      );
    }
    if (RESERVED_WORDS.has(token.value.toLowerCase())) {
      throw new FormulaParseFailure(
        `"${token.value}" is reserved and can't be a parameter name`,
        token.position
      );
    }
    return { name: token.value, position: token.position, end: token.end };
  }

  /**
   * Consume `=>` and the body. The body extends as far right as possible
   * (the full expression ladder), like a JS arrow function.
   */
  private parseLambdaBody(
    params: FormulaLambdaParam[],
    position: number
  ): FormulaLambdaNode {
    this.expectPunct("=>", "after the parameter list");
    const body = this.parseExpression();
    return { kind: "lambda", params, body, position, end: this.lastEnd };
  }

  private parseListLiteral(): FormulaNode {
    const open = this.advance();
    const items: FormulaNode[] = [];
    if (this.matchPunct("]") !== null) {
      return {
        kind: "list",
        items,
        position: open.position,
        end: this.lastEnd,
      };
    }
    for (;;) {
      items.push(this.parseExpression());
      const comma = this.matchPunct(",");
      if (comma !== null) {
        if (this.peekIsPunct("]")) {
          throw new FormulaParseFailure(
            'Unexpected "]" after "," — remove the trailing comma',
            comma.position
          );
        }
        continue;
      }
      this.expectPunct("]", "to close the list");
      return {
        kind: "list",
        items,
        position: open.position,
        end: this.lastEnd,
      };
    }
  }

  /** Parse a call's argument list; the opening `(` is already consumed. */
  private parseArguments(name: string): FormulaNode[] {
    const args: FormulaNode[] = [];
    if (this.matchPunct(")") !== null) {
      return args;
    }
    for (;;) {
      args.push(this.parseExpression());
      const comma = this.matchPunct(",");
      if (comma !== null) {
        if (this.peekIsPunct(")")) {
          throw new FormulaParseFailure(
            'Unexpected ")" after "," — remove the trailing comma',
            comma.position
          );
        }
        continue;
      }
      this.expectPunct(")", `to close the "${name}(…)" call`);
      return args;
    }
  }
}

function describeToken(token: FormulaToken): string {
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
 * Parse a formula source string into an AST. Never throws: lexical and
 * syntactic problems come back as `{ ok: false, error: { message, position } }`
 * with a 0-based character position into `source`.
 */
export function parseFormula(source: string): ParseFormulaResult {
  if (source.length > MAX_EXPRESSION_LENGTH) {
    return {
      ok: false,
      error: {
        message: `Expression too long (max ${MAX_EXPRESSION_LENGTH} characters)`,
        position: 0,
      },
    };
  }
  const lexed = tokenizeFormula(source);
  if (!lexed.ok) {
    return { ok: false, error: lexed.error };
  }
  try {
    return { ok: true, ast: new Parser(lexed.tokens).parse() };
  } catch (error) {
    if (error instanceof FormulaParseFailure) {
      return {
        ok: false,
        error: { message: error.message, position: error.position },
      };
    }
    throw error;
  }
}
