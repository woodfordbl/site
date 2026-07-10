/**
 * Static checker for the v2 formula language (`lib/formula`) — proposal
 * §4.5. Bidirectional over the AST: types synthesize bottom-up, expected
 * types push into function arguments and lambda bodies via the typed catalog
 * signatures. Produces the result type for the editor badge, span-accurate
 * error diagnostics, and the static reference extraction the dependency
 * graph consumes.
 *
 * The checker is deliberately optimistic (only certain mistakes diagnose): a
 * union argument is accepted when ANY member fits, `unknown` is accepted
 * everywhere and accepts everything, and a node that produced a diagnostic
 * synthesizes `unknown` so one mistake yields one diagnostic, never a
 * cascade (Elm discipline). Blankness is a runtime concern — property
 * references type as their plain cell type, and per-row blank failures
 * surface as ⚠ cells, not check errors. Checking never throws.
 */

import type {
  FormulaBinaryNode,
  FormulaBinaryOp,
  FormulaCallNode,
  FormulaLambdaNode,
  FormulaListNode,
  FormulaMemberNode,
  FormulaNameNode,
  FormulaNode,
  FormulaPropertyNode,
  FormulaUnaryNode,
} from "@/lib/formula/ast.ts";
import {
  FORMULA_FUNCTION_CATALOG,
  type FormulaFunctionEntry,
  type FormulaParamSpec,
  formulaArityMessage,
  formulaFunctionForName,
  formulaFunctionMessageName,
  formulaMaxArgs,
  formulaMinArgs,
} from "@/lib/formula/catalog.ts";
import {
  BLANK_TYPE,
  BOOLEAN_TYPE,
  DATE_TYPE,
  type FormulaType,
  formulaTypeExpectedPhrase,
  formulaTypeName,
  lambdaTypeOf,
  listTypeOf,
  NUMBER_TYPE,
  TEXT_TYPE,
  UNKNOWN_TYPE,
  unionTypeOf,
} from "@/lib/formula/types.ts";
import { LAMBDA_AS_VALUE_MESSAGE } from "@/lib/formula/values.ts";

type LambdaType = Extract<FormulaType, { kind: "lambda" }>;

/**
 * Field kinds the checker can project into formula cell types. Mirrors
 * `DatabaseFieldType` (`lib/schemas/database.ts`) structurally so schema
 * fields pass straight through, without coupling the pure language package
 * to the schema module.
 */
export type FormulaFieldKind =
  | "text"
  | "number"
  | "checkbox"
  | "select"
  | "multiSelect"
  | "date"
  | "url"
  | "formula";

/** One schema field visible to the formula being checked. */
export interface FormulaCheckProperty {
  readonly id: string;
  readonly kind: FormulaFieldKind;
  readonly name: string;
  /**
   * For `formula` fields: the pre-computed result type, or `unknown` when
   * the caller can't know yet (cross-formula ordering is the caller's job).
   * Ignored for every other kind — the cell type derives from `kind`.
   */
  readonly type: FormulaType;
}

/** Schema context a formula checks against. */
export interface FormulaCheckContext {
  readonly properties: readonly FormulaCheckProperty[];
}

/** One positioned check error; `start`/`end` are 0-based, end-exclusive. */
export interface FormulaCheckDiagnostic {
  readonly end: number;
  readonly message: string;
  readonly severity: "error";
  readonly start: number;
}

/** Everything {@link checkFormula} produces in one pass. */
export interface FormulaCheckResult {
  readonly diagnostics: FormulaCheckDiagnostic[];
  /**
   * Field ids referenced by the formula — id references directly (including
   * unresolved ids, so dependency tracking can heal a restored field), name
   * references via their resolved field. Deduplicated, source order.
   */
  readonly references: string[];
  readonly resultType: FormulaType;
  /** Name references that resolved to no field (broken-reference UX). */
  readonly unresolvedNames: string[];
}

/**
 * Name-reference normalization — the same rule evaluation uses
 * (`lib/formula/row-scope.ts`), so "which field does this name mean" can never
 * drift between checking and evaluation.
 */
export function normalizeFormulaPropertyName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * The formula type a field's cells produce: text/url/select → text, number
 * → number, checkbox → boolean, date → date, multiSelect → list of text,
 * formula → its pre-computed result type. Shared with the evaluator's row
 * scope (next stage) so checking and evaluation can never disagree.
 */
export function formulaPropertyValueType(
  field: Pick<FormulaCheckProperty, "kind" | "type">
): FormulaType {
  switch (field.kind) {
    case "number":
      return NUMBER_TYPE;
    case "checkbox":
      return BOOLEAN_TYPE;
    case "date":
      return DATE_TYPE;
    case "multiSelect":
      return listTypeOf(TEXT_TYPE);
    case "formula":
      return field.type;
    case "text":
    case "url":
    case "select":
      return TEXT_TYPE;
    default:
      return UNKNOWN_TYPE;
  }
}

/**
 * Short human label for the editor's result-type badge — "number", "text",
 * "list of numbers", "boolean", "unknown". Unions read "number or text",
 * with a blank member suppressed (`if(x, 1)` badges "number", not "number
 * or blank" — display only, `resultType` keeps the full union); the internal
 * `error` and `typevar` kinds never reach users and read "unknown".
 */
export function formulaTypeBadge(type: FormulaType): string {
  if (type.kind === "error" || type.kind === "typevar") {
    return "unknown";
  }
  if (type.kind === "union") {
    const visible = type.members.filter((member) => member.kind !== "blank");
    if (visible.length > 0 && visible.length < type.members.length) {
      const shown: FormulaType =
        visible.length === 1 ? visible[0] : { kind: "union", members: visible };
      return formulaTypeName(shown);
    }
  }
  return formulaTypeName(type);
}

// --- module constants -------------------------------------------------------

/**
 * Character length of each binary operator's lexeme, anchoring operand-type
 * diagnostics at the operator itself. `and` written `&&` (and `or` written
 * `||`) normalizes at parse time, so the span can overshoot the lexeme by
 * one character in the `&&` spelling — harmless for squiggles.
 */
const OP_LEXEME_LENGTH: Record<FormulaBinaryOp, number> = {
  "!=": 2,
  "%": 1,
  "*": 1,
  "+": 1,
  "-": 1,
  "/": 1,
  "<": 1,
  "<=": 2,
  "==": 2,
  ">": 1,
  ">=": 2,
  and: 3,
  coalesce: 2,
  or: 2,
  pow: 1,
};

/**
 * What `+`'s text-concatenation overload can coerce — the runtime
 * `formulaValueToText` set minus blank (blank + anything is a runtime
 * error, checked before the string branch in `applyPlus`).
 */
const PLUS_COERCIBLE = unionTypeOf(
  TEXT_TYPE,
  NUMBER_TYPE,
  BOOLEAN_TYPE,
  DATE_TYPE
);

/**
 * What a lenient text parameter accepts silently — exactly the values the
 * runtime coerces via `formulaValueToText`. Built literally because five
 * members would exceed `unionTypeOf`'s width cap; this is an internal
 * acceptance set only, mismatch messages display the declared `text` type.
 */
const LENIENT_TEXT_MEMBERS: readonly FormulaType[] = [
  TEXT_TYPE,
  NUMBER_TYPE,
  BOOLEAN_TYPE,
  DATE_TYPE,
  BLANK_TYPE,
];

const LENIENT_TEXT_ACCEPTS: FormulaType = {
  kind: "union",
  members: LENIENT_TEXT_MEMBERS,
};

const ORDERABLE_KINDS = ["number", "text", "date"] as const;

type OrderableKind = (typeof ORDERABLE_KINDS)[number];

/** Prose list: "map, filter, or sort". */
function proseNameList(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? "";
  }
  return `${names.slice(0, -1).join(", ")}, or ${names.at(-1)}`;
}

/** Catalog functions whose signatures accept a lambda argument. */
const LAMBDA_ACCEPTING_NAMES = FORMULA_FUNCTION_CATALOG.filter((entry) =>
  entry.params.some((param) => param.type.kind === "lambda")
).map((entry) => entry.name);

const MISPLACED_LAMBDA_MESSAGE = `A function like x => … can only be used as an argument of ${proseNameList(LAMBDA_ACCEPTING_NAMES)}`;

const MEMBER_ACCESS_MESSAGE =
  "Property access works on relation values, which arrive with relations; call a function instead, like .round()";

const DELETED_FIELD_MESSAGE = "References a deleted or unknown field";

// --- type-level helpers -----------------------------------------------------

/**
 * Optimistic acceptance: `unknown` fits everywhere and accepts everything, a
 * union fits when ANY member fits, an unbound type variable accepts anything
 * (it binds afterwards), and `error` never cascades into a second
 * diagnostic.
 */
function typeFits(actual: FormulaType, expected: FormulaType): boolean {
  if (actual.kind === "unknown" || actual.kind === "error") {
    return true;
  }
  if (expected.kind === "unknown" || expected.kind === "typevar") {
    return true;
  }
  if (actual.kind === "union") {
    return actual.members.some((member) => typeFits(member, expected));
  }
  if (expected.kind === "union") {
    return expected.members.some((member) => typeFits(actual, member));
  }
  if (expected.kind === "list") {
    return actual.kind === "list" && typeFits(actual.element, expected.element);
  }
  if (expected.kind === "row") {
    return (
      actual.kind === "row" &&
      (expected.databaseId === undefined ||
        actual.databaseId === expected.databaseId)
    );
  }
  return actual.kind === expected.kind;
}

/** Per-call-site instantiation of the signature's type variables. */
type TypevarBindings = Map<string, FormulaType>;

/**
 * Replace bound type variables throughout a declared type. Unbound
 * variables stay in place while arguments are still binding them, and
 * finalize to `unknown` (`unboundToUnknown`) for the call's return type.
 */
function substituteType(
  type: FormulaType,
  bindings: TypevarBindings,
  unboundToUnknown: boolean
): FormulaType {
  switch (type.kind) {
    case "typevar":
      return (
        bindings.get(type.name) ?? (unboundToUnknown ? UNKNOWN_TYPE : type)
      );
    case "list":
      return listTypeOf(
        substituteType(type.element, bindings, unboundToUnknown)
      );
    case "lambda":
      return lambdaTypeOf(
        type.params.map((param) =>
          substituteType(param, bindings, unboundToUnknown)
        ),
        substituteType(type.returns, bindings, unboundToUnknown)
      );
    case "union":
      return unionTypeOf(
        ...type.members.map((member) =>
          substituteType(member, bindings, unboundToUnknown)
        )
      );
    default:
      return type;
  }
}

/** Ground a synthesized type before binding a type variable to it. */
function groundType(type: FormulaType): FormulaType {
  return type.kind === "error" ? UNKNOWN_TYPE : type;
}

/** The element type an argument used as `list<T>` contributes to `T`. */
function listElementType(actual: FormulaType): FormulaType {
  if (actual.kind === "list") {
    return actual.element;
  }
  if (actual.kind === "union") {
    const elements = actual.members.flatMap((member) =>
      member.kind === "list" ? [member.element] : []
    );
    return elements.length > 0 ? unionTypeOf(...elements) : UNKNOWN_TYPE;
  }
  return UNKNOWN_TYPE;
}

/**
 * Bind still-unbound type variables in a declared parameter type from a
 * fitting argument type (first binding wins — later mismatches diagnose
 * against the bound type instead of silently widening it).
 */
function bindTypeVariables(
  declared: FormulaType,
  actual: FormulaType,
  bindings: TypevarBindings
): void {
  if (declared.kind === "typevar") {
    if (!bindings.has(declared.name)) {
      bindings.set(declared.name, groundType(actual));
    }
    return;
  }
  if (declared.kind === "list") {
    bindTypeVariables(declared.element, listElementType(actual), bindings);
  }
}

/** The orderable kinds (number/text/date) a type could be at runtime. */
function orderableKindsOf(type: FormulaType): ReadonlySet<OrderableKind> {
  if (type.kind === "unknown" || type.kind === "error") {
    return new Set(ORDERABLE_KINDS);
  }
  if (type.kind === "union") {
    const kinds = new Set<OrderableKind>();
    for (const member of type.members) {
      for (const kind of orderableKindsOf(member)) {
        kinds.add(kind);
      }
    }
    return kinds;
  }
  if (type.kind === "number" || type.kind === "text" || type.kind === "date") {
    return new Set([type.kind]);
  }
  return new Set();
}

/** Whether the type is, or could be, text — enabling `+` concatenation. */
function hasTextMember(type: FormulaType): boolean {
  if (type.kind === "text") {
    return true;
  }
  return (
    type.kind === "union" &&
    type.members.some((member) => member.kind === "text")
  );
}

function literalType(value: number | string | boolean | null): FormulaType {
  if (value === null) {
    return BLANK_TYPE;
  }
  if (typeof value === "number") {
    return NUMBER_TYPE;
  }
  if (typeof value === "string") {
    return TEXT_TYPE;
  }
  return BOOLEAN_TYPE;
}

/**
 * The type set an argument must fit: lenient text parameters take
 * everything the runtime coerces to text — including the text member of a
 * lenient union parameter (`contains`'s text-or-list value), whose other
 * members stay accepted as declared; everything else is the declared type
 * with already-bound type variables substituted in.
 */
function acceptedTypeFor(
  param: FormulaParamSpec,
  bindings: TypevarBindings
): FormulaType {
  if (!param.lenient) {
    return substituteType(param.type, bindings, false);
  }
  if (param.type.kind === "text") {
    return LENIENT_TEXT_ACCEPTS;
  }
  if (
    param.type.kind === "union" &&
    param.type.members.some((member) => member.kind === "text")
  ) {
    const rest = param.type.members
      .filter((member) => member.kind !== "text")
      .map((member) => substituteType(member, bindings, false));
    return { kind: "union", members: [...LENIENT_TEXT_MEMBERS, ...rest] };
  }
  return substituteType(param.type, bindings, false);
}

/**
 * "expects X, got Y" for an argument mismatch — except a lambda-typed value,
 * which mirrors the runtime's "needs to be called" misuse error verbatim.
 */
function expectsMismatchMessage(
  messageName: string,
  expected: FormulaType,
  actual: FormulaType
): string {
  if (actual.kind === "lambda") {
    return LAMBDA_AS_VALUE_MESSAGE;
  }
  return `${messageName}() expects ${formulaTypeExpectedPhrase(expected)}, got ${formulaTypeName(actual)}`;
}

// --- unknown-function suggestions -------------------------------------------

const MAX_SUGGESTION_DISTANCE = 2;
const MIN_PREFIX_QUERY_LENGTH = 2;

/** Levenshtein distance, bailing early when the lengths alone exceed the cap. */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > MAX_SUGGESTION_DISTANCE) {
    return MAX_SUGGESTION_DISTANCE + 1;
  }
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current.push(Math.min(previous[j] + 1, current[j - 1] + 1, substitution));
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Nearest catalog name or alias for an unknown call — edit distance ≤ 2,
 * with a typed-prefix match (e.g. `formatD` → `formatDate`) counting as
 * distance 1. Ties resolve in catalog order.
 */
function suggestFunctionName(name: string): string | null {
  const lower = name.toLowerCase();
  let best: string | null = null;
  let bestScore = MAX_SUGGESTION_DISTANCE + 1;
  for (const entry of FORMULA_FUNCTION_CATALOG) {
    for (const candidate of [entry.name, ...(entry.aliases ?? [])]) {
      const candidateLower = candidate.toLowerCase();
      const isPrefix =
        lower.length >= MIN_PREFIX_QUERY_LENGTH &&
        candidateLower.startsWith(lower);
      const score = isPrefix ? 1 : editDistance(lower, candidateLower);
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
  }
  return bestScore <= MAX_SUGGESTION_DISTANCE ? best : null;
}

// --- the checker ------------------------------------------------------------

/** One static binding frame (let/lets binding or lambda parameter). */
interface CheckBinding {
  readonly name: string;
  readonly parent: CheckBinding | null;
  readonly type: FormulaType;
}

/** Exact-match (case-sensitive) binding lookup, mirroring the evaluator. */
function lookupBinding(
  env: CheckBinding | null,
  name: string
): CheckBinding | null {
  for (let frame = env; frame !== null; frame = frame.parent) {
    if (frame.name === name) {
      return frame;
    }
  }
  return null;
}

/** A case-insensitively matching binding name, for "did you mean" hints. */
function similarBindingName(
  env: CheckBinding | null,
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

/** The signature parameter governing the argument at `index`. */
function paramForIndex(
  entry: FormulaFunctionEntry,
  index: number
): FormulaParamSpec | undefined {
  if (index < entry.params.length) {
    return entry.params[index];
  }
  const last = entry.params.at(-1);
  return last?.variadic ? last : undefined;
}

interface Span {
  readonly end: number;
  readonly start: number;
}

function spanOf(node: FormulaNode): Span {
  return { end: node.end, start: node.position };
}

function opSpan(node: FormulaBinaryNode): Span {
  return {
    end: node.opPosition + OP_LEXEME_LENGTH[node.op],
    start: node.opPosition,
  };
}

class Checker {
  private readonly diagnostics: FormulaCheckDiagnostic[] = [];
  private readonly fieldsById = new Map<string, FormulaCheckProperty>();
  private readonly fieldsByName = new Map<string, FormulaCheckProperty>();
  private readonly references: string[] = [];
  private readonly seenReferences = new Set<string>();
  private readonly seenUnresolved = new Set<string>();
  private readonly unresolvedNames: string[] = [];

  constructor(context: FormulaCheckContext) {
    for (const property of context.properties) {
      this.fieldsById.set(property.id, property);
      const key = normalizeFormulaPropertyName(property.name);
      if (!this.fieldsByName.has(key)) {
        // Two fields sharing a normalized name: first in schema order wins,
        // matching evaluation.
        this.fieldsByName.set(key, property);
      }
    }
  }

  resultFor(resultType: FormulaType): FormulaCheckResult {
    return {
      diagnostics: this.diagnostics,
      references: this.references,
      resultType,
      unresolvedNames: this.unresolvedNames,
    };
  }

  synth(node: FormulaNode, env: CheckBinding | null): FormulaType {
    switch (node.kind) {
      case "literal":
        return literalType(node.value);
      case "property":
        return this.synthProperty(node);
      case "name":
        return this.synthName(node, env);
      case "unary":
        return this.synthUnary(node, env);
      case "binary":
        return this.synthBinary(node, env);
      case "call":
        return this.synthCall(node, env);
      case "member":
        return this.synthMember(node, env);
      case "lambda":
        return this.synthMisplacedLambda(node, env);
      case "list":
        return this.synthList(node, env);
      default:
        return UNKNOWN_TYPE;
    }
  }

  /** Push a diagnostic; the offending node synthesizes `unknown`. */
  private report(message: string, span: Span): FormulaType {
    this.diagnostics.push({
      end: span.end,
      message,
      severity: "error",
      start: span.start,
    });
    return UNKNOWN_TYPE;
  }

  private addReference(id: string): void {
    if (!this.seenReferences.has(id)) {
      this.seenReferences.add(id);
      this.references.push(id);
    }
  }

  private addUnresolvedName(name: string): void {
    if (!this.seenUnresolved.has(name)) {
      this.seenUnresolved.add(name);
      this.unresolvedNames.push(name);
    }
  }

  /**
   * Resolve a property reference like evaluation does: exact field id
   * first, then (for the `thisPage.X` spelling only) normalized name.
   * Canonical `prop("…")` references never fall back to names — an
   * unresolved id is a broken chip, and it still counts as a reference so
   * dependency tracking can heal when the field is restored.
   */
  private synthProperty(node: FormulaPropertyNode): FormulaType {
    const byId = this.fieldsById.get(node.name);
    const field =
      byId ??
      (node.via === "scope"
        ? this.fieldsByName.get(normalizeFormulaPropertyName(node.name))
        : undefined);
    if (field !== undefined) {
      this.addReference(field.id);
      return formulaPropertyValueType(field);
    }
    if (node.via === "prop") {
      this.addReference(node.name);
      return this.report(DELETED_FIELD_MESSAGE, spanOf(node));
    }
    this.addUnresolvedName(node.name);
    return this.report(`Unknown property "${node.name}"`, spanOf(node));
  }

  private synthName(
    node: FormulaNameNode,
    env: CheckBinding | null
  ): FormulaType {
    const binding = lookupBinding(env, node.name);
    if (binding !== null) {
      return binding.type;
    }
    const similar = similarBindingName(env, node.name);
    if (similar !== null) {
      return this.report(
        `Unknown name "${node.name}" — did you mean "${similar}"?`,
        spanOf(node)
      );
    }
    const field = this.fieldsByName.get(
      normalizeFormulaPropertyName(node.name)
    );
    if (field !== undefined) {
      return this.report(
        `Unknown name "${node.name}" — did you mean "thisPage.${field.name}"?`,
        spanOf(node)
      );
    }
    return this.report(`Unknown name "${node.name}"`, spanOf(node));
  }

  private synthUnary(
    node: FormulaUnaryNode,
    env: CheckBinding | null
  ): FormulaType {
    const operand = this.synth(node.operand, env);
    if (operand.kind === "lambda") {
      // Mirrors the runtime: a bound lambda is not an operand.
      return this.report(LAMBDA_AS_VALUE_MESSAGE, spanOf(node.operand));
    }
    if (node.op === "-") {
      if (typeFits(operand, NUMBER_TYPE)) {
        return NUMBER_TYPE;
      }
      return this.report(
        `Cannot negate ${formulaTypeName(operand)}`,
        spanOf(node.operand)
      );
    }
    if (typeFits(operand, BOOLEAN_TYPE)) {
      return BOOLEAN_TYPE;
    }
    return this.report(
      `"not" expects a boolean, got ${formulaTypeName(operand)}`,
      spanOf(node.operand)
    );
  }

  private synthBinary(
    node: FormulaBinaryNode,
    env: CheckBinding | null
  ): FormulaType {
    const left = this.synth(node.left, env);
    const right = this.synth(node.right, env);
    if (node.op === "coalesce") {
      // Optimistic: no "left must be blankable" requirement. Also the one
      // binary operator the runtime lets a lambda value flow through.
      return unionTypeOf(left, right);
    }
    if (left.kind === "lambda" || right.kind === "lambda") {
      // Mirrors the runtime: every strict binary op rejects lambda operands.
      return this.report(LAMBDA_AS_VALUE_MESSAGE, opSpan(node));
    }
    switch (node.op) {
      case "and":
      case "or":
        return this.checkLogical(node, left, right);
      case "==":
      case "!=":
        // Equality is any-vs-any; mismatched types are unequal, not errors.
        return BOOLEAN_TYPE;
      case "<":
      case "<=":
      case ">":
      case ">=":
        return this.checkComparison(node, left, right);
      case "+":
        return this.checkPlus(node, left, right);
      default:
        return this.checkArithmetic(node, left, right);
    }
  }

  private checkLogical(
    node: FormulaBinaryNode,
    left: FormulaType,
    right: FormulaType
  ): FormulaType {
    let offender: FormulaType | null = null;
    if (!typeFits(left, BOOLEAN_TYPE)) {
      offender = left;
    } else if (!typeFits(right, BOOLEAN_TYPE)) {
      offender = right;
    }
    if (offender === null) {
      return BOOLEAN_TYPE;
    }
    return this.report(
      `"${node.op}" expects a boolean, got ${formulaTypeName(offender)}`,
      opSpan(node)
    );
  }

  private checkComparison(
    node: FormulaBinaryNode,
    left: FormulaType,
    right: FormulaType
  ): FormulaType {
    const leftKinds = orderableKindsOf(left);
    const rightKinds = orderableKindsOf(right);
    const comparable = [...leftKinds].some((kind) => rightKinds.has(kind));
    if (comparable) {
      return BOOLEAN_TYPE;
    }
    return this.report(
      `Cannot compare ${formulaTypeName(left)} and ${formulaTypeName(right)}`,
      opSpan(node)
    );
  }

  /** Mirror the runtime `+`: number addition, or text concat when a side is text. */
  private checkPlus(
    node: FormulaBinaryNode,
    left: FormulaType,
    right: FormulaType
  ): FormulaType {
    const opaque = (type: FormulaType) =>
      type.kind === "unknown" || type.kind === "error";
    if (opaque(left) || opaque(right)) {
      return UNKNOWN_TYPE;
    }
    const numberOk =
      typeFits(left, NUMBER_TYPE) && typeFits(right, NUMBER_TYPE);
    const textOk =
      (hasTextMember(left) || hasTextMember(right)) &&
      typeFits(left, PLUS_COERCIBLE) &&
      typeFits(right, PLUS_COERCIBLE);
    if (numberOk && textOk) {
      return unionTypeOf(NUMBER_TYPE, TEXT_TYPE);
    }
    if (numberOk) {
      return NUMBER_TYPE;
    }
    if (textOk) {
      return TEXT_TYPE;
    }
    return this.report(
      `Cannot add ${formulaTypeName(left)} and ${formulaTypeName(right)}`,
      opSpan(node)
    );
  }

  private checkArithmetic(
    node: FormulaBinaryNode,
    left: FormulaType,
    right: FormulaType
  ): FormulaType {
    if (typeFits(left, NUMBER_TYPE) && typeFits(right, NUMBER_TYPE)) {
      return NUMBER_TYPE;
    }
    const display = node.op === "pow" ? "^" : node.op;
    return this.report(
      `Cannot apply "${display}" to ${formulaTypeName(left)} and ${formulaTypeName(right)}`,
      opSpan(node)
    );
  }

  private synthList(
    node: FormulaListNode,
    env: CheckBinding | null
  ): FormulaType {
    const itemTypes = node.items.map((item) => this.synth(item, env));
    // Empty list → list<unknown> (unionTypeOf() is unknown).
    return listTypeOf(unionTypeOf(...itemTypes));
  }

  private synthMember(
    node: FormulaMemberNode,
    env: CheckBinding | null
  ): FormulaType {
    this.synth(node.receiver, env);
    return this.report(MEMBER_ACCESS_MESSAGE, {
      end: node.end,
      start: node.namePosition,
    });
  }

  /**
   * A lambda outside the positions that accept one (a lambda-expecting
   * argument, or a `let`/`lets` bound value).
   */
  private synthMisplacedLambda(
    node: FormulaLambdaNode,
    env: CheckBinding | null
  ): FormulaType {
    const result = this.report(MISPLACED_LAMBDA_MESSAGE, spanOf(node));
    this.synthLambdaBodyLeniently(node, env);
    return result;
  }

  /**
   * Type a lambda expression as a value — for `let`/`lets` bindings, where
   * the runtime keeps it as a first-class closure. Parameters type as
   * `unknown` (call-site types are unknowable at the binding), the return
   * synthesizes optimistically from the body.
   */
  private synthLambdaValue(
    node: FormulaLambdaNode,
    env: CheckBinding | null
  ): FormulaType {
    let scope = env;
    for (const param of node.params) {
      scope = { name: param.name, parent: scope, type: UNKNOWN_TYPE };
    }
    const returns = this.synth(node.body, scope);
    return lambdaTypeOf(
      node.params.map(() => UNKNOWN_TYPE),
      returns
    );
  }

  /** A `let`/`lets` bound value: lambda expressions are legal here. */
  private synthBoundValue(
    node: FormulaNode,
    env: CheckBinding | null
  ): FormulaType {
    if (node.kind === "lambda") {
      return this.synthLambdaValue(node, env);
    }
    return this.synth(node, env);
  }

  /**
   * Walk a lambda body with its parameters bound to `unknown` — used when
   * the expected shape is unknowable (misplaced lambdas, calls that already
   * failed), so references and genuine body mistakes still surface.
   */
  private synthLambdaBodyLeniently(
    node: FormulaLambdaNode,
    env: CheckBinding | null
  ): void {
    this.synthLambdaValue(node, env);
  }

  /**
   * Best-effort walk of call arguments after a call-level diagnostic:
   * still collects references and nested diagnostics, but doesn't judge
   * lambda placement — we no longer know what each position expects.
   */
  private walkArgumentsLeniently(
    args: readonly FormulaNode[],
    env: CheckBinding | null
  ): void {
    for (const arg of args) {
      if (arg.kind === "lambda") {
        this.synthLambdaBodyLeniently(arg, env);
      } else {
        this.synth(arg, env);
      }
    }
  }

  private synthCall(
    node: FormulaCallNode,
    env: CheckBinding | null
  ): FormulaType {
    const lower = node.name.toLowerCase();
    if (lower === "let") {
      return this.checkLet(node, env);
    }
    if (lower === "lets") {
      return this.checkLets(node, env);
    }
    // Bindings shadow catalog functions, exactly like evaluation.
    const binding = lookupBinding(env, node.name);
    if (binding !== null) {
      return this.checkBoundCall(node, binding, env);
    }
    const entry = formulaFunctionForName(node.name);
    if (entry === undefined) {
      return this.reportUnknownFunction(node, env);
    }
    if (entry.name === "if") {
      return this.checkIf(node, entry, env);
    }
    if (entry.name === "switch") {
      return this.checkSwitch(node, entry, env);
    }
    return this.checkCatalogCall(node, entry, lower, env);
  }

  private reportUnknownFunction(
    node: FormulaCallNode,
    env: CheckBinding | null
  ): FormulaType {
    const suggestion = suggestFunctionName(node.name);
    const hint = suggestion === null ? "" : ` — did you mean "${suggestion}"?`;
    const result = this.report(
      `Unknown function "${node.name}"${hint}`,
      spanOf(node)
    );
    this.walkArgumentsLeniently(node.args, env);
    return result;
  }

  /** Call through a `let`/lambda binding, e.g. `let(f, x => x + 1, f(2))`. */
  private checkBoundCall(
    node: FormulaCallNode,
    binding: CheckBinding,
    env: CheckBinding | null
  ): FormulaType {
    if (binding.type.kind === "lambda") {
      return this.checkBoundLambdaCall(node, binding.type, env);
    }
    if (binding.type.kind !== "unknown" && binding.type.kind !== "error") {
      this.report(`"${node.name}" is not a function`, spanOf(node));
    }
    this.walkArgumentsLeniently(node.args, env);
    return UNKNOWN_TYPE;
  }

  /**
   * Calling a lambda-typed binding. The runtime requires at least as many
   * arguments as the lambda names (extra arguments are ignored) — same
   * check, same message, at check time. Parameter types are unknown (they
   * were typed at the binding, not per call site), so arguments are only
   * walked; lambda arguments stay legal because the runtime applies them.
   */
  private checkBoundLambdaCall(
    node: FormulaCallNode,
    type: LambdaType,
    env: CheckBinding | null
  ): FormulaType {
    let ok = true;
    if (node.args.length < type.params.length) {
      this.report(
        `The lambda names ${type.params.length} parameters, but only ${node.args.length} value(s) are provided here`,
        spanOf(node)
      );
      ok = false;
    }
    this.walkArgumentsLeniently(node.args, env);
    return ok ? type.returns : UNKNOWN_TYPE;
  }

  /** True (with a diagnostic) when the argument count is out of range. */
  private arityMismatch(
    node: FormulaCallNode,
    entry: FormulaFunctionEntry
  ): boolean {
    const count = node.args.length;
    if (count >= formulaMinArgs(entry) && count <= formulaMaxArgs(entry)) {
      return false;
    }
    this.report(formulaArityMessage(node.name, entry, count), spanOf(node));
    return true;
  }

  /** `if(boolean, T, U?) → T | U (| blank when the else is omitted)`. */
  private checkIf(
    node: FormulaCallNode,
    entry: FormulaFunctionEntry,
    env: CheckBinding | null
  ): FormulaType {
    if (this.arityMismatch(node, entry)) {
      this.walkArgumentsLeniently(node.args, env);
      return UNKNOWN_TYPE;
    }
    const condition = this.synth(node.args[0], env);
    let ok = true;
    if (!typeFits(condition, BOOLEAN_TYPE)) {
      this.report(
        expectsMismatchMessage("if", BOOLEAN_TYPE, condition),
        spanOf(node.args[0])
      );
      ok = false;
    }
    const thenType = this.synth(node.args[1], env);
    const elseType =
      node.args.length > 2 ? this.synth(node.args[2], env) : BLANK_TYPE;
    return ok ? unionTypeOf(thenType, elseType) : UNKNOWN_TYPE;
  }

  /** `switch(T, case…, result…, default?) → union of branches (+ blank sans default)`. */
  private checkSwitch(
    node: FormulaCallNode,
    entry: FormulaFunctionEntry,
    env: CheckBinding | null
  ): FormulaType {
    if (this.arityMismatch(node, entry)) {
      this.walkArgumentsLeniently(node.args, env);
      return UNKNOWN_TYPE;
    }
    const subject = this.synth(node.args[0], env);
    const branchTypes: FormulaType[] = [];
    let ok = true;
    let index = 1;
    while (index + 1 < node.args.length) {
      const caseType = this.synth(node.args[index], env);
      if (!typeFits(caseType, subject)) {
        this.report(
          `This case is ${formulaTypeName(caseType)}, but the switch value is ${formulaTypeName(subject)}, so it can never match`,
          spanOf(node.args[index])
        );
        ok = false;
      }
      branchTypes.push(this.synth(node.args[index + 1], env));
      index += 2;
    }
    if (index < node.args.length) {
      branchTypes.push(this.synth(node.args[index], env));
    } else {
      branchTypes.push(BLANK_TYPE);
    }
    return ok ? unionTypeOf(...branchTypes) : UNKNOWN_TYPE;
  }

  private checkCatalogCall(
    node: FormulaCallNode,
    entry: FormulaFunctionEntry,
    lower: string,
    env: CheckBinding | null
  ): FormulaType {
    if (this.arityMismatch(node, entry)) {
      this.walkArgumentsLeniently(node.args, env);
      return UNKNOWN_TYPE;
    }
    const messageName = formulaFunctionMessageName(entry, lower);
    const bindings: TypevarBindings = new Map();
    let ok = true;
    for (const [index, arg] of node.args.entries()) {
      const param = paramForIndex(entry, index);
      if (param === undefined) {
        continue;
      }
      ok = this.checkArgument(arg, param, messageName, bindings, env) && ok;
    }
    return ok ? substituteType(entry.returns, bindings, true) : UNKNOWN_TYPE;
  }

  /** Check one non-special argument; returns false when it diagnosed. */
  private checkArgument(
    arg: FormulaNode,
    param: FormulaParamSpec,
    messageName: string,
    bindings: TypevarBindings,
    env: CheckBinding | null
  ): boolean {
    if (param.type.kind === "lambda") {
      return this.checkLambdaArgument(arg, param, messageName, bindings, env);
    }
    // A lambda node here synthesizes the misplaced-lambda diagnostic itself
    // (and then fits as unknown) — one mistake, one diagnostic.
    const argType = this.synth(arg, env);
    if (typeFits(argType, acceptedTypeFor(param, bindings))) {
      bindTypeVariables(param.type, argType, bindings);
      return true;
    }
    const expected = substituteType(param.type, bindings, false);
    this.report(
      expectsMismatchMessage(messageName, expected, argType),
      spanOf(arg)
    );
    return false;
  }

  /**
   * Check a lambda-typed argument: arity against the declared supply (the
   * signature's lambda parameter count is exactly what the implementation
   * passes), parameters pushed into the body, the body's type checked or
   * bound against the declared return.
   */
  private checkLambdaArgument(
    arg: FormulaNode,
    param: FormulaParamSpec,
    messageName: string,
    bindings: TypevarBindings,
    env: CheckBinding | null
  ): boolean {
    const declared = param.type;
    if (declared.kind !== "lambda") {
      return true;
    }
    if (arg.kind !== "lambda") {
      return this.checkLambdaValueArgument(
        arg,
        declared,
        param,
        messageName,
        bindings,
        env
      );
    }
    let ok = true;
    if (arg.params.length > declared.params.length) {
      this.report(
        `The function names ${arg.params.length} parameters, but ${messageName}() provides only ${declared.params.length}`,
        spanOf(arg)
      );
      ok = false;
    }
    let scope = env;
    for (const [index, lambdaParam] of arg.params.entries()) {
      const declaredParam = declared.params[index] ?? UNKNOWN_TYPE;
      scope = {
        name: lambdaParam.name,
        parent: scope,
        type: substituteType(declaredParam, bindings, true),
      };
    }
    const bodyType = this.synth(arg.body, scope);
    return (
      this.checkLambdaReturn(
        declared.returns,
        bodyType,
        spanOf(arg.body),
        param,
        messageName,
        bindings
      ) && ok
    );
  }

  /**
   * A non-lambda expression in a lambda-expecting argument position. A
   * lambda-typed binding (`let(f, x => x + 1, map([1, 2], f))`) is legal at
   * runtime, so it type-checks like an inline lambda: arity against the
   * declared supply and its synthesized return against the declared return.
   */
  private checkLambdaValueArgument(
    arg: FormulaNode,
    declared: LambdaType,
    param: FormulaParamSpec,
    messageName: string,
    bindings: TypevarBindings,
    env: CheckBinding | null
  ): boolean {
    const argType = this.synth(arg, env);
    if (argType.kind === "lambda") {
      let ok = true;
      if (argType.params.length > declared.params.length) {
        this.report(
          `The function names ${argType.params.length} parameters, but ${messageName}() provides only ${declared.params.length}`,
          spanOf(arg)
        );
        ok = false;
      }
      return (
        this.checkLambdaReturn(
          declared.returns,
          argType.returns,
          spanOf(arg),
          param,
          messageName,
          bindings
        ) && ok
      );
    }
    if (argType.kind === "unknown" || argType.kind === "error") {
      return true;
    }
    this.report(
      `${messageName}() expects a function, got ${formulaTypeName(argType)}`,
      spanOf(arg)
    );
    return false;
  }

  private checkLambdaReturn(
    returns: FormulaType,
    actual: FormulaType,
    span: Span,
    param: FormulaParamSpec,
    messageName: string,
    bindings: TypevarBindings
  ): boolean {
    if (returns.kind === "typevar") {
      if (!bindings.has(returns.name)) {
        bindings.set(returns.name, groundType(actual));
      }
      return true;
    }
    if (typeFits(actual, returns)) {
      return true;
    }
    this.report(
      `${messageName}() expects the ${param.name} function to return ${formulaTypeExpectedPhrase(returns)}, got ${formulaTypeName(actual)}`,
      span
    );
    return false;
  }

  /** `let(name, value, body)` — same shape rules the evaluator enforces. */
  private checkLet(
    node: FormulaCallNode,
    env: CheckBinding | null
  ): FormulaType {
    if (node.args.length !== 3) {
      const result = this.report(
        `let() expects 3 arguments, got ${node.args.length}`,
        spanOf(node)
      );
      this.walkBinderArgumentsLeniently(node.args, env, new Set([0]));
      return result;
    }
    const binder = node.args[0];
    if (binder.kind !== "name") {
      const result = this.report(
        "let() expects a name as argument 1, like let(x, 1, x + 1)",
        spanOf(binder)
      );
      this.walkArgumentsLeniently([node.args[1], node.args[2]], env);
      return result;
    }
    const valueType = this.synthBoundValue(node.args[1], env);
    return this.synth(node.args[2], {
      name: binder.name,
      parent: env,
      type: valueType,
    });
  }

  /** `lets(name, value, …, result)` — pairs bind left to right. */
  private checkLets(
    node: FormulaCallNode,
    env: CheckBinding | null
  ): FormulaType {
    const count = node.args.length;
    let ok = true;
    if (count < 3) {
      this.report(
        `lets() expects at least 3 arguments, got ${count}`,
        spanOf(node)
      );
      ok = false;
    } else if (count % 2 === 0) {
      this.report(
        `lets() expects name/value pairs followed by one result, got ${count} arguments`,
        spanOf(node)
      );
      ok = false;
    }
    if (count === 0) {
      return UNKNOWN_TYPE;
    }
    let scope = env;
    let index = 0;
    while (index + 2 <= count - 1) {
      const binder = node.args[index];
      let name: string | null = null;
      if (binder.kind === "name") {
        name = binder.name;
      } else {
        this.report(
          `lets() expects a name as argument ${index + 1}, like lets(a, 1, b, a + 1, b * 2)`,
          spanOf(binder)
        );
        ok = false;
      }
      const valueType = this.synthBoundValue(node.args[index + 1], scope);
      if (name !== null) {
        scope = { name, parent: scope, type: valueType };
      }
      index += 2;
    }
    // An even count leaves one unpaired argument before the result; walk it
    // for references, skipping what is most likely a stray binder name.
    for (; index < count - 1; index += 1) {
      const orphan = node.args[index];
      if (orphan.kind !== "name") {
        this.synth(orphan, scope);
      }
    }
    const resultType = this.synth(node.args[count - 1], scope);
    return ok ? resultType : UNKNOWN_TYPE;
  }

  /** Lenient walk that also skips name nodes at binder positions. */
  private walkBinderArgumentsLeniently(
    args: readonly FormulaNode[],
    env: CheckBinding | null,
    binderIndices: ReadonlySet<number>
  ): void {
    for (const [index, arg] of args.entries()) {
      if (binderIndices.has(index) && arg.kind === "name") {
        continue;
      }
      if (arg.kind === "lambda") {
        this.synthLambdaBodyLeniently(arg, env);
      } else {
        this.synth(arg, env);
      }
    }
  }
}

/**
 * Statically check a parsed formula against a schema context. Never throws:
 * every problem is a positioned diagnostic, and internal failures degrade to
 * a single diagnostic over the whole expression.
 */
export function checkFormula(
  ast: FormulaNode,
  context: FormulaCheckContext
): FormulaCheckResult {
  try {
    const checker = new Checker(context);
    const resultType = checker.synth(ast, null);
    return checker.resultFor(resultType);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      diagnostics: [
        {
          end: ast.end,
          message: `Internal formula checker error: ${message}`,
          severity: "error",
          start: ast.position,
        },
      ],
      references: [],
      resultType: UNKNOWN_TYPE,
      unresolvedNames: [],
    };
  }
}
