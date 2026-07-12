/**
 * Tree-walk evaluator for the v2 formula language (`lib/formula`). Walks a
 * parsed AST against an injected property scope and produces a
 * `FormulaValue` — never throwing: every failure (division by zero, unknown
 * name/function, type mismatch) is a `FormulaError` VALUE that propagates
 * through operators and eager arguments; only lazily-evaluated branches
 * (`if`/`switch`/`and`/`or`/`??`) are exempt.
 *
 * Function dispatch runs off the typed catalog (`catalog.ts`); `let`/`lets`
 * are evaluator special forms because they bind names from raw AST nodes.
 * The parser bounds AST depth, but lambdas enable unbounded call recursion
 * through higher-order functions, so lambda application is depth-capped.
 */

import type {
  FormulaBinaryOp,
  FormulaCallNode,
  FormulaMemberNode,
  FormulaNameNode,
  FormulaNode,
} from "@/lib/formula/ast.ts";
import { walkFormula } from "@/lib/formula/ast.ts";
import {
  type FormulaCallContext,
  type FormulaFunctionEntry,
  type FormulaThunk,
  formulaArityMessage,
  formulaFunctionForName,
  formulaFunctionMessageName,
  formulaMaxArgs,
  formulaMinArgs,
  VOLATILE_FORMULA_FUNCTION_NAMES,
} from "@/lib/formula/catalog.ts";
import { formulaValueToText } from "@/lib/formula/display.ts";
import { resolveFormulaRowMember } from "@/lib/formula/row-scope.ts";
import { formulaTypeExpectedPhrase } from "@/lib/formula/types.ts";
import {
  FormulaDate,
  type FormulaEnvironment,
  type FormulaError,
  FormulaLambda,
  FormulaRowRef,
  type FormulaScope,
  type FormulaValue,
  formulaError,
  formulaMemberOnNonRowMessage,
  formulaMemberOnRowListMessage,
  formulaValueMatchesType,
  formulaValuesEqual,
  formulaValueTypeName,
  isFormulaError,
  LAMBDA_AS_VALUE_MESSAGE,
  requireBooleanValue,
} from "@/lib/formula/values.ts";

/**
 * Deepest accepted lambda-application nesting. The AST itself is
 * depth-bounded by the parser, but a lambda applying itself through a
 * higher-order function recurses without bound — this cap turns that into a
 * friendly error value instead of a stack overflow.
 */
const MAX_CALL_DEPTH = 100;

function unaryError(op: "-" | "not", operand: FormulaValue): FormulaError {
  if (op === "-") {
    return formulaError(`Cannot negate ${formulaValueTypeName(operand)}`);
  }
  return formulaError(
    `"not" expects a boolean, got ${formulaValueTypeName(operand)}`
  );
}

function applyUnary(op: "-" | "not", operand: FormulaValue): FormulaValue {
  if (isFormulaError(operand)) {
    return operand;
  }
  if (operand instanceof FormulaLambda) {
    return formulaError(LAMBDA_AS_VALUE_MESSAGE);
  }
  if (op === "-") {
    return typeof operand === "number" ? -operand : unaryError(op, operand);
  }
  return typeof operand === "boolean" ? !operand : unaryError(op, operand);
}

function applyPlus(left: FormulaValue, right: FormulaValue): FormulaValue {
  const cannotAdd = () =>
    formulaError(
      `Cannot add ${formulaValueTypeName(left)} and ${formulaValueTypeName(right)}`
    );
  if (left === null || right === null) {
    return cannotAdd();
  }
  if (typeof left === "string" || typeof right === "string") {
    const leftText = formulaValueToText(left);
    if (typeof leftText !== "string") {
      return leftText;
    }
    const rightText = formulaValueToText(right);
    if (typeof rightText !== "string") {
      return rightText;
    }
    return leftText + rightText;
  }
  if (typeof left === "number" && typeof right === "number") {
    return left + right;
  }
  // Includes date + number: dateAdd() exists for that.
  return cannotAdd();
}

function applyArithmetic(
  op: "-" | "*" | "/" | "%",
  left: FormulaValue,
  right: FormulaValue
): FormulaValue {
  if (typeof left !== "number" || typeof right !== "number") {
    return formulaError(
      `Cannot apply "${op}" to ${formulaValueTypeName(left)} and ${formulaValueTypeName(right)}`
    );
  }
  if ((op === "/" || op === "%") && right === 0) {
    return formulaError("Division by zero");
  }
  switch (op) {
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return left / right;
    default:
      return left % right;
  }
}

function applyPower(left: FormulaValue, right: FormulaValue): FormulaValue {
  if (typeof left !== "number" || typeof right !== "number") {
    return formulaError(
      `Cannot apply "^" to ${formulaValueTypeName(left)} and ${formulaValueTypeName(right)}`
    );
  }
  // JS `**` already yields 1 for 0 ** 0.
  const result = left ** right;
  if (!Number.isFinite(result)) {
    return formulaError('Result of "^" is not a finite number');
  }
  return result;
}

function compareOrdered(
  op: "<" | "<=" | ">" | ">=",
  left: FormulaValue,
  right: FormulaValue
): FormulaValue {
  let leftKey: number | string;
  let rightKey: number | string;
  if (typeof left === "number" && typeof right === "number") {
    leftKey = left;
    rightKey = right;
  } else if (typeof left === "string" && typeof right === "string") {
    leftKey = left;
    rightKey = right;
  } else if (left instanceof FormulaDate && right instanceof FormulaDate) {
    leftKey = left.time;
    rightKey = right.time;
  } else {
    return formulaError(
      `Cannot compare ${formulaValueTypeName(left)} and ${formulaValueTypeName(right)}`
    );
  }
  switch (op) {
    case "<":
      return leftKey < rightKey;
    case "<=":
      return leftKey <= rightKey;
    case ">":
      return leftKey > rightKey;
    default:
      return leftKey >= rightKey;
  }
}

/** Strict binary application; operands are plain (non-error) values. */
function applyBinary(
  op: Exclude<FormulaBinaryOp, "and" | "or" | "coalesce">,
  left: FormulaValue,
  right: FormulaValue
): FormulaValue {
  if (left instanceof FormulaLambda || right instanceof FormulaLambda) {
    return formulaError(LAMBDA_AS_VALUE_MESSAGE);
  }
  switch (op) {
    case "+":
      return applyPlus(left, right);
    case "-":
    case "*":
    case "/":
    case "%":
      return applyArithmetic(op, left, right);
    case "pow":
      return applyPower(left, right);
    case "==":
      return formulaValuesEqual(left, right);
    case "!=":
      return !formulaValuesEqual(left, right);
    default:
      return compareOrdered(op, left, right);
  }
}

/** Exact-match (case-sensitive) binding lookup along the environment chain. */
function lookupBinding(
  env: FormulaEnvironment | null,
  name: string
): { value: FormulaValue } | null {
  for (let frame = env; frame !== null; frame = frame.parent) {
    if (frame.name === name) {
      return { value: frame.value };
    }
  }
  return null;
}

/** A case-insensitively matching binding name, for "did you mean" hints. */
function similarBindingName(
  env: FormulaEnvironment | null,
  name: string
): string | null {
  const lower = name.toLowerCase();
  for (let frame = env; frame !== null; frame = frame.parent) {
    if (frame.name.toLowerCase() === lower) {
      return frame.name;
    }
  }
  return null;
}

/** Memoize a thunk so lazy arguments evaluate at most once. */
function memoThunk(compute: () => FormulaValue): FormulaThunk {
  let evaluated = false;
  let cached: FormulaValue = null;
  return () => {
    if (!evaluated) {
      cached = compute();
      evaluated = true;
    }
    return cached;
  };
}

/** The signature parameter governing the argument at `index`. */
function paramForIndex(entry: FormulaFunctionEntry, index: number) {
  if (index < entry.params.length) {
    return entry.params[index];
  }
  const last = entry.params.at(-1);
  return last?.variadic ? last : undefined;
}

/**
 * Generic argument type gate driven by the catalog signature. `lenient`
 * params (coercing text functions, compound aggregate shapes) opt out and
 * validate inside their implementation.
 */
function argumentTypeError(
  entry: FormulaFunctionEntry,
  messageName: string,
  values: readonly FormulaValue[]
): FormulaError | null {
  for (const [index, value] of values.entries()) {
    const param = paramForIndex(entry, index);
    if (!param || param.lenient) {
      continue;
    }
    if (!formulaValueMatchesType(value, param.type)) {
      if (value instanceof FormulaLambda) {
        return formulaError(LAMBDA_AS_VALUE_MESSAGE);
      }
      return formulaError(
        `${messageName}() expects ${formulaTypeExpectedPhrase(param.type)}, got ${formulaValueTypeName(value)}`
      );
    }
  }
  return null;
}

class Evaluator {
  private callDepth = 0;
  private readonly scope: FormulaScope;

  constructor(scope: FormulaScope) {
    this.scope = scope;
  }

  evalNode(node: FormulaNode, env: FormulaEnvironment | null): FormulaValue {
    switch (node.kind) {
      case "literal":
        return node.value;
      case "property":
        return this.scope.getProperty(node.name);
      case "name":
        return this.evalName(node, env);
      case "unary":
        return applyUnary(node.op, this.evalNode(node.operand, env));
      case "binary":
        return this.evalBinary(node, env);
      case "call":
        return this.evalCall(node, env);
      case "member":
        return this.evalMember(node, env);
      case "lambda":
        return new FormulaLambda(
          node.params.map((param) => param.name),
          node.body,
          env
        );
      case "list":
        return this.evalList(node.items, env);
      default:
        return formulaError("Unsupported expression");
    }
  }

  private evalName(
    node: FormulaNameNode,
    env: FormulaEnvironment | null
  ): FormulaValue {
    const binding = lookupBinding(env, node.name);
    if (binding !== null) {
      return binding.value;
    }
    const similar = similarBindingName(env, node.name);
    if (similar !== null) {
      return formulaError(
        `Unknown name "${node.name}" — did you mean "${similar}"?`
      );
    }
    return formulaError(`Unknown name "${node.name}"`);
  }

  /**
   * `receiver.Name` — property access on a relation row ref, resolved
   * through the scope's relation resolver (`row-scope.ts` owns the field
   * lookup and cell mapping). Blank receivers propagate blank so chains
   * like `prop("Rel").first().Estimate` read as blank for unlinked rows;
   * every other non-row receiver is a type error mirroring the checker's
   * member diagnostics (a list of rows gets the `.map` hint).
   */
  private evalMember(
    node: FormulaMemberNode,
    env: FormulaEnvironment | null
  ): FormulaValue {
    const value = this.evalNode(node.receiver, env);
    if (isFormulaError(value)) {
      return value;
    }
    if (value instanceof FormulaRowRef) {
      return resolveFormulaRowMember(value, node.name, this.scope.relations);
    }
    if (value === null) {
      return null;
    }
    if (value instanceof FormulaLambda) {
      return formulaError(LAMBDA_AS_VALUE_MESSAGE);
    }
    if (
      Array.isArray(value) &&
      value.some((item) => item instanceof FormulaRowRef)
    ) {
      return formulaError(formulaMemberOnRowListMessage(node.name));
    }
    return formulaError(
      formulaMemberOnNonRowMessage(formulaValueTypeName(value))
    );
  }

  private evalList(
    items: readonly FormulaNode[],
    env: FormulaEnvironment | null
  ): FormulaValue {
    const values: FormulaValue[] = [];
    for (const item of items) {
      const value = this.evalNode(item, env);
      if (isFormulaError(value)) {
        return value;
      }
      values.push(value);
    }
    return values;
  }

  private evalBinary(
    node: Extract<FormulaNode, { kind: "binary" }>,
    env: FormulaEnvironment | null
  ): FormulaValue {
    if (node.op === "and" || node.op === "or") {
      return this.evalLogical(node.op, node.left, node.right, env);
    }
    if (node.op === "coalesce") {
      const left = this.evalNode(node.left, env);
      if (isFormulaError(left)) {
        // Errors are not blanks: ?? does not catch them.
        return left;
      }
      return left === null ? this.evalNode(node.right, env) : left;
    }
    const left = this.evalNode(node.left, env);
    if (isFormulaError(left)) {
      return left;
    }
    const right = this.evalNode(node.right, env);
    if (isFormulaError(right)) {
      return right;
    }
    return applyBinary(node.op, left, right);
  }

  private evalLogical(
    op: "and" | "or",
    leftNode: FormulaNode,
    rightNode: FormulaNode,
    env: FormulaEnvironment | null
  ): FormulaValue {
    const left = requireBooleanValue(this.evalNode(leftNode, env), op);
    if (typeof left !== "boolean") {
      return left;
    }
    // Short-circuit: the untaken side never evaluates.
    if (op === "and" && !left) {
      return false;
    }
    if (op === "or" && left) {
      return true;
    }
    return requireBooleanValue(this.evalNode(rightNode, env), op);
  }

  private evalCall(
    node: FormulaCallNode,
    env: FormulaEnvironment | null
  ): FormulaValue {
    const lower = node.name.toLowerCase();
    if (lower === "let") {
      return this.evalLet(node, env);
    }
    if (lower === "lets") {
      return this.evalLets(node, env);
    }
    const binding = lookupBinding(env, node.name);
    if (binding !== null) {
      return this.callBoundValue(node, binding.value, env);
    }
    const entry = formulaFunctionForName(node.name);
    if (entry === undefined) {
      return formulaError(`Unknown function "${node.name}"`);
    }
    return this.dispatch(node, entry, lower, env);
  }

  private dispatch(
    node: FormulaCallNode,
    entry: FormulaFunctionEntry,
    lower: string,
    env: FormulaEnvironment | null
  ): FormulaValue {
    const count = node.args.length;
    if (count < formulaMinArgs(entry) || count > formulaMaxArgs(entry)) {
      return formulaError(formulaArityMessage(node.name, entry, count));
    }
    const messageName = formulaFunctionMessageName(entry, lower);
    const context = this.contextFor(messageName);
    if (entry.kind === "lazy") {
      const thunks = node.args.map((arg) =>
        memoThunk(() => this.evalNode(arg, env))
      );
      return entry.apply(thunks, context);
    }
    const values = this.evalArguments(node.args, env);
    if (isFormulaError(values)) {
      return values;
    }
    const mismatch = argumentTypeError(entry, messageName, values);
    if (mismatch !== null) {
      return mismatch;
    }
    return entry.apply(values, context);
  }

  /** Evaluate eager arguments left-to-right; the first error wins. */
  private evalArguments(
    args: readonly FormulaNode[],
    env: FormulaEnvironment | null
  ): FormulaValue[] | FormulaError {
    const values: FormulaValue[] = [];
    for (const arg of args) {
      const value = this.evalNode(arg, env);
      if (isFormulaError(value)) {
        return value;
      }
      values.push(value);
    }
    return values;
  }

  /** Call through a `let`/lambda binding: `let(f, x => x + 1, f(2))`. */
  private callBoundValue(
    node: FormulaCallNode,
    bound: FormulaValue,
    env: FormulaEnvironment | null
  ): FormulaValue {
    if (isFormulaError(bound)) {
      return bound;
    }
    if (!(bound instanceof FormulaLambda)) {
      return formulaError(`"${node.name}" is not a function`);
    }
    const args = this.evalArguments(node.args, env);
    if (isFormulaError(args)) {
      return args;
    }
    return this.applyLambda(bound, args);
  }

  private contextFor(name: string): FormulaCallContext {
    return {
      callLambda: (fn, args) => this.callLambdaValue(name, fn, args),
      name,
      scope: this.scope,
    };
  }

  private callLambdaValue(
    name: string,
    fn: FormulaValue,
    args: readonly FormulaValue[]
  ): FormulaValue {
    if (isFormulaError(fn)) {
      return fn;
    }
    if (!(fn instanceof FormulaLambda)) {
      // The signature gate normally guarantees this; defensive for HOFs.
      return formulaError(
        `${name}() expects a function, got ${formulaValueTypeName(fn)}`
      );
    }
    return this.applyLambda(fn, args);
  }

  private applyLambda(
    fn: FormulaLambda,
    args: readonly FormulaValue[]
  ): FormulaValue {
    if (fn.params.length > args.length) {
      return formulaError(
        `The lambda names ${fn.params.length} parameters, but only ${args.length} value(s) are provided here`
      );
    }
    this.callDepth += 1;
    try {
      if (this.callDepth > MAX_CALL_DEPTH) {
        return formulaError(
          `Formula recursion went too deep (more than ${MAX_CALL_DEPTH} nested function calls)`
        );
      }
      let env = fn.env;
      for (const [index, param] of fn.params.entries()) {
        env = { name: param, parent: env, value: args[index] };
      }
      return this.evalNode(fn.body, env);
    } finally {
      this.callDepth -= 1;
    }
  }

  private evalLet(
    node: FormulaCallNode,
    env: FormulaEnvironment | null
  ): FormulaValue {
    if (node.args.length !== 3) {
      return formulaError(`let() expects 3 arguments, got ${node.args.length}`);
    }
    const nameNode = node.args[0];
    if (nameNode.kind !== "name") {
      return formulaError(
        "let() expects a name as argument 1, like let(x, 1, x + 1)"
      );
    }
    const value = this.evalNode(node.args[1], env);
    if (isFormulaError(value)) {
      return value;
    }
    return this.evalNode(node.args[2], {
      name: nameNode.name,
      parent: env,
      value,
    });
  }

  private evalLets(
    node: FormulaCallNode,
    env: FormulaEnvironment | null
  ): FormulaValue {
    const count = node.args.length;
    if (count < 3) {
      return formulaError(`lets() expects at least 3 arguments, got ${count}`);
    }
    if (count % 2 === 0) {
      return formulaError(
        `lets() expects name/value pairs followed by one result, got ${count} arguments`
      );
    }
    let bindings = env;
    for (let index = 0; index + 1 < count; index += 2) {
      const nameNode = node.args[index];
      if (nameNode.kind !== "name") {
        return formulaError(
          `lets() expects a name as argument ${index + 1}, like lets(a, 1, b, a + 1, b * 2)`
        );
      }
      const value = this.evalNode(node.args[index + 1], bindings);
      if (isFormulaError(value)) {
        return value;
      }
      bindings = { name: nameNode.name, parent: bindings, value };
    }
    return this.evalNode(node.args[count - 1], bindings);
  }
}

/**
 * Evaluate a parsed formula against a scope. Never throws — all failure
 * modes surface as `FormulaError` values, and any error operand propagates
 * outward (except through untaken lazy branches). Internal exceptions are
 * caught at this boundary and degrade to an error value.
 */
export function evaluateFormula(
  ast: FormulaNode,
  scope: FormulaScope
): FormulaValue {
  try {
    return new Evaluator(scope).evalNode(ast, null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return formulaError(`Internal formula error: ${message}`);
  }
}

/**
 * Whether a formula reads the clock (`now()`/`today()` anywhere in the
 * tree, method-call spelling included). Volatile formulas need scheduled
 * re-evaluation ticks; they must never become dependency-graph edges.
 */
export function isVolatileFormula(ast: FormulaNode): boolean {
  let volatile = false;
  walkFormula(ast, (node) => {
    if (
      node.kind === "call" &&
      VOLATILE_FORMULA_FUNCTION_NAMES.has(node.name.toLowerCase())
    ) {
      volatile = true;
      return false;
    }
    return true;
  });
  return volatile;
}
