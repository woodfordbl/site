/**
 * Runtime value model for the v2 formula language (`lib/formula`). Scalars
 * stay plain JS values for speed (number/string/boolean/null — `null` IS
 * blank); the non-scalar values are small classes discriminated with
 * `instanceof`/`Array.isArray`. Errors keep v1's error-as-value propagation:
 * evaluation never throws, any error operand wins, only lazily-evaluated
 * branches are exempt.
 */

import type { FormulaNode } from "@/lib/formula/ast.ts";
import type { FormulaType } from "@/lib/formula/types.ts";
// Type-only (erased at compile time), so the runtime value model stays free
// of any schema/database coupling.
import type {
  DatabaseCellValue,
  DatabaseField,
} from "@/lib/schemas/database.ts";

/**
 * A calendar-aware date value: an instant plus a `dateOnly` flag. Comparisons
 * and equality use the instant; `dateOnly` affects only display and the
 * defaults of calendar math. The wrapped `Date` is defensively copied so a
 * caller mutating its input can't corrupt the value.
 */
export class FormulaDate {
  readonly date: Date;
  readonly dateOnly: boolean;

  constructor(date: Date, dateOnly: boolean) {
    this.date = new Date(date.getTime());
    this.dateOnly = dateOnly;
  }

  /** Epoch milliseconds of the instant — the comparison key. */
  get time(): number {
    return this.date.getTime();
  }
}

/**
 * A typed reference to a row of a known database — the value a relation
 * cell produces (one ref per linked target row). Deliberately just the two
 * ids: member access (`r.Estimate`) resolves lazily through the scope's
 * {@link FormulaRelationResolver}, so refs stay cheap to build, copy, and
 * compare (`formulaValuesEqual` compares by database + row id).
 */
export class FormulaRowRef {
  readonly databaseId: string;
  readonly rowId: string;

  constructor(databaseId: string, rowId: string) {
    this.databaseId = databaseId;
    this.rowId = rowId;
  }
}

/**
 * One evaluated binding frame — a persistent (immutable, shared-tail) linked
 * list so lambda closures capture their defining environment by reference
 * and `let` shadowing is just a longer chain.
 */
export interface FormulaEnvironment {
  readonly name: string;
  readonly parent: FormulaEnvironment | null;
  readonly value: FormulaValue;
}

/**
 * A lambda closure: parameter names plus the body node and the environment
 * it closed over. Lambdas are values only so higher-order functions can
 * apply them; any other use is a runtime type error
 * ({@link LAMBDA_AS_VALUE_MESSAGE}).
 */
export class FormulaLambda {
  readonly body: FormulaNode;
  readonly env: FormulaEnvironment | null;
  readonly params: readonly string[];

  constructor(
    params: readonly string[],
    body: FormulaNode,
    env: FormulaEnvironment | null
  ) {
    this.params = params;
    this.body = body;
    this.env = env;
  }
}

/**
 * A distinguished error value (not a thrown `Error`). Evaluation never
 * throws — errors flow through operators and functions as values, so a bad
 * formula degrades to an inline message, never a crash.
 */
export class FormulaError {
  readonly message: string;

  constructor(message: string) {
    this.message = message;
  }
}

/** Any runtime formula value. `null` is blank. */
export type FormulaValue =
  | number
  | string
  | boolean
  | null
  | FormulaDate
  | FormulaRowRef
  | FormulaLambda
  | FormulaValue[]
  | FormulaError;

/** Create a {@link FormulaError} value. */
export function formulaError(message: string): FormulaError {
  return new FormulaError(message);
}

/** Whether a formula value is a {@link FormulaError}. */
export function isFormulaError(value: FormulaValue): value is FormulaError {
  return value instanceof FormulaError;
}

/**
 * One target database as the relation resolver exposes it: the schema needed
 * to resolve members by name, the primary field for row display labels, and
 * a per-row values lookup (`null` = the id no longer resolves — deleted row
 * or retargeted relation — so stale refs read as blank, never throw).
 */
export interface FormulaRelationDatabase {
  readonly fields: readonly DatabaseField[];
  readonly name: string;
  readonly primaryFieldId: string;
  row(rowId: string): Record<string, DatabaseCellValue> | null;
}

/**
 * Cross-database reader injected into evaluation so relation values resolve
 * lazily: relation cells project to {@link FormulaRowRef} lists, and member
 * access on a ref reads the target row through this interface. The pure
 * layer only defines the contract — the database layer implements it over
 * the local collections (`lib/databases/formula-relations.ts`).
 *
 * `formulaValue` computes a FORMULA member of a target row (the target's own
 * per-database plan: topological order, same-database cycles as named
 * errors). Implementations must guard cross-database cycles themselves — a
 * re-entrant (databaseId, fieldId, rowId) returns a "Circular reference"
 * error value. Optional so pure test stubs without formula fields stay tiny;
 * absent, formula members read as blank.
 */
export interface FormulaRelationResolver {
  database(databaseId: string): FormulaRelationDatabase | null;
  formulaValue?(
    databaseId: string,
    rowId: string,
    fieldId: string
  ): FormulaValue;
  /**
   * Every current row id of a database, for whole-database `db("…")`
   * references (`null` = the id names no database — an unknown-database
   * error value, mirroring the checker's diagnostic). Optional so resolvers
   * predating db() (pure relation stubs) stay valid; absent, db() reads as
   * an unavailability error, never a throw.
   */
  rowIds?(databaseId: string): readonly string[] | null;
}

/**
 * One named user-defined function definition (Sheets Named Functions model,
 * proposal §9 P5): a parameterized formula stored once at workspace level
 * and callable from any formula. The pure layer consumes definitions
 * through {@link FormulaPreparedUserFunctions} — bodies parsed ONCE by
 * `prepareUserFunctions` (`lib/formula/user-functions.ts`).
 */
export interface FormulaUserFunction {
  readonly description?: string;
  /** The body expression, in canonical stored text (may use prop()/db()). */
  readonly expression: string;
  readonly name: string;
  /** Parameter names, bound to the call's arguments over the body. */
  readonly params: readonly string[];
}

/** One prepared definition: the body parsed once, or its parse error. */
export interface FormulaPreparedUserFunction {
  /** Parsed body AST, or `null` when the expression doesn't parse. */
  readonly body: FormulaNode | null;
  /** The parse-error message when `body` is null (definition editor UX). */
  readonly bodyError: string | null;
  readonly description?: string;
  readonly name: string;
  readonly params: readonly string[];
}

/**
 * The prepared user-function registry, keyed by LOWERCASED name (lookups are
 * case-insensitive, like the catalog's). Threaded into checking via
 * `FormulaCheckContext.userFunctions` and into evaluation via
 * {@link FormulaScope.userFunctions}; resolution order is bindings →
 * catalog → user functions (write-time validation prevents catalog
 * collisions, but the catalog wins if one slips through).
 */
export type FormulaPreparedUserFunctions = ReadonlyMap<
  string,
  FormulaPreparedUserFunction
>;

/**
 * Calling a user function whose definition doesn't parse. Shared by the
 * checker (call-site diagnostic) and the evaluator (error value) so the
 * message can never drift between them.
 */
export function formulaUserFunctionBrokenMessage(name: string): string {
  return `The custom function "${name}" has an error in its definition`;
}

/**
 * Wrong argument count for a user function — exact arity, v1 message shape.
 * Shared by the checker and the evaluator.
 */
export function formulaUserFunctionArityMessage(
  name: string,
  expected: number,
  got: number
): string {
  const plural = expected === 1 ? "argument" : "arguments";
  return `${name}() expects ${expected} ${plural}, got ${got}`;
}

/**
 * A recursive user-function call (direct or mutual), named like the
 * cross-database cycle guard: `Circular function: a → b → a`.
 */
export function formulaCircularFunctionMessage(
  path: readonly string[]
): string {
  return `Circular function: ${path.join(" → ")}`;
}

/** Error message for using a lambda anywhere except a function argument. */
export const LAMBDA_AS_VALUE_MESSAGE =
  "A function needs to be called, not used as a value";

/**
 * Member access on something that isn't a row. Shared by the checker
 * (static type name) and the evaluator (runtime type name) so the message
 * can never drift between them.
 */
export function formulaMemberOnNonRowMessage(typeName: string): string {
  return `Property access works on a row from a relation, got ${typeName}`;
}

/** Member access on a LIST of rows — point the user at `.map`. */
export function formulaMemberOnRowListMessage(name: string): string {
  return `Use .map(r => r.${name}) to read "${name}" from each row of the list`;
}

/**
 * A `db("…")` reference that names no database. Shared by the checker
 * (unknown id diagnostic) and the evaluator (error value) so the message can
 * never drift between them — the `isn't a property of` discipline.
 */
export function formulaUnknownDatabaseMessage(reference: string): string {
  return `"${reference}" isn't a database`;
}

/**
 * `db("…")` evaluated through a scope whose resolver can't enumerate rows
 * (no resolver, or one predating `rowIds`) — a caller wiring gap, surfaced
 * as an error value like {@link resolveFormulaRowMember}'s
 * "Related rows are not available here".
 */
export const DATABASE_REF_UNAVAILABLE_MESSAGE =
  "Database references are not available here";

/**
 * The evaluation environment injected by the caller. `getProperty` resolves
 * `thisPage.X` / `prop("…")` references. `now` is the injected clock for
 * `now()`/`today()` — when absent, a fixed epoch keeps pure callers
 * deterministic; interactive callers pass the real clock. (Same shape as
 * v1's `ExprScope`.) `relations` resolves member access on relation row
 * refs; absent, relation members read as unresolvable errors.
 */
export interface FormulaScope {
  getProperty(ref: string): FormulaValue;
  now?(): Date;
  relations?: FormulaRelationResolver;
  /**
   * Named user-defined functions callable from this formula (prepared
   * registry, lowercased-name keys). Absent, user-function calls read as
   * unknown functions — exactly the pre-P5 behavior.
   */
  userFunctions?: FormulaPreparedUserFunctions;
}

/**
 * The fixed instant `now()`/`today()` report when the scope injects no
 * clock, chosen at UTC noon so the local date part is stable across most
 * timezones (v1 convention).
 */
export const FORMULA_FIXED_NOW_ISO = "2020-01-01T12:00:00.000Z";

/** The scope's clock, or the fixed deterministic epoch. */
export function formulaScopeNow(scope: FormulaScope): Date {
  return scope.now ? scope.now() : new Date(FORMULA_FIXED_NOW_ISO);
}

/**
 * Human-readable runtime type name for error messages. Blank reads "empty"
 * to keep v1's message text verbatim (the static type model calls the same
 * thing "blank").
 */
export function formulaValueTypeName(value: FormulaValue): string {
  if (value === null) {
    return "empty";
  }
  if (typeof value === "string") {
    return "text";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return typeof value;
  }
  if (Array.isArray(value)) {
    return "list";
  }
  if (value instanceof FormulaDate) {
    return "date";
  }
  if (value instanceof FormulaRowRef) {
    return "row";
  }
  if (value instanceof FormulaLambda) {
    return "function";
  }
  return "error";
}

/**
 * `==` semantics, shared by the operator, `switch`, `includes`, and
 * `unique`: type-aware (mismatched types are unequal, not an error), blank
 * equals only blank, dates compare by instant (`dateOnly` ignored), rows by
 * database + row id, lists element-wise recursively, lambdas by reference.
 */
export function formulaValuesEqual(
  left: FormulaValue,
  right: FormulaValue
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => formulaValuesEqual(item, right[index]))
    );
  }
  if (left instanceof FormulaDate || right instanceof FormulaDate) {
    return (
      left instanceof FormulaDate &&
      right instanceof FormulaDate &&
      left.time === right.time
    );
  }
  if (left instanceof FormulaRowRef || right instanceof FormulaRowRef) {
    return (
      left instanceof FormulaRowRef &&
      right instanceof FormulaRowRef &&
      left.databaseId === right.databaseId &&
      left.rowId === right.rowId
    );
  }
  if (typeof left !== typeof right) {
    return false;
  }
  return left === right;
}

/**
 * Require a number, v1 message shape (`min() expects a number, got empty`).
 * Errors pass through; lambdas get the misuse message.
 */
export function requireNumberValue(
  value: FormulaValue,
  fnName: string
): number | FormulaError {
  if (isFormulaError(value)) {
    return value;
  }
  if (value instanceof FormulaLambda) {
    return formulaError(LAMBDA_AS_VALUE_MESSAGE);
  }
  if (typeof value !== "number") {
    return formulaError(
      `${fnName}() expects a number, got ${formulaValueTypeName(value)}`
    );
  }
  return value;
}

/**
 * Require a boolean, v1 message shape (`"if" expects a boolean, got empty`).
 * Errors pass through; lambdas get the misuse message.
 */
export function requireBooleanValue(
  value: FormulaValue,
  opName: string
): boolean | FormulaError {
  if (isFormulaError(value)) {
    return value;
  }
  if (value instanceof FormulaLambda) {
    return formulaError(LAMBDA_AS_VALUE_MESSAGE);
  }
  if (typeof value !== "boolean") {
    return formulaError(
      `"${opName}" expects a boolean, got ${formulaValueTypeName(value)}`
    );
  }
  return value;
}

/**
 * Top-level runtime check of a value against a declared type, for the
 * generic argument gate. List elements are NOT deep-checked here —
 * implementations validate elements themselves for precise messages.
 * `unknown` and type variables accept anything.
 */
export function formulaValueMatchesType(
  value: FormulaValue,
  type: FormulaType
): boolean {
  switch (type.kind) {
    case "number":
    case "text":
    case "boolean":
      return typeof value === (type.kind === "text" ? "string" : type.kind);
    case "date":
      return value instanceof FormulaDate;
    case "blank":
      return value === null;
    case "list":
      return Array.isArray(value);
    case "row":
      return value instanceof FormulaRowRef;
    case "lambda":
      return value instanceof FormulaLambda;
    case "error":
      return isFormulaError(value);
    case "union":
      return type.members.some((member) =>
        formulaValueMatchesType(value, member)
      );
    default:
      return true;
  }
}
