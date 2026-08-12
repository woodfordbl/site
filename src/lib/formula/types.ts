/**
 * Static type model for the v2 formula language (`lib/formula`). The typed
 * function catalog (`catalog.ts`) declares signatures against these types
 * today; the bidirectional checker (proposal §4.5, next stage) will consume
 * the same declarations. Pure data, no runtime-value coupling — checking a
 * runtime value against a type lives in `values.ts`.
 */

/** A formula type. `typevar` is only valid inside catalog signatures. */
export type FormulaType =
  | { readonly kind: "blank" }
  | { readonly kind: "boolean" }
  | { readonly kind: "date" }
  | { readonly kind: "error" }
  | {
      readonly kind: "lambda";
      readonly params: readonly FormulaType[];
      readonly returns: FormulaType;
    }
  | { readonly kind: "list"; readonly element: FormulaType }
  | { readonly kind: "number" }
  | { readonly kind: "row"; readonly databaseId?: string }
  | { readonly kind: "text" }
  | { readonly kind: "typevar"; readonly name: string }
  | { readonly kind: "union"; readonly members: readonly FormulaType[] }
  | { readonly kind: "unknown" };

export const NUMBER_TYPE: FormulaType = { kind: "number" };
export const TEXT_TYPE: FormulaType = { kind: "text" };
export const BOOLEAN_TYPE: FormulaType = { kind: "boolean" };
export const DATE_TYPE: FormulaType = { kind: "date" };
export const BLANK_TYPE: FormulaType = { kind: "blank" };
export const UNKNOWN_TYPE: FormulaType = { kind: "unknown" };
export const ERROR_TYPE: FormulaType = { kind: "error" };

/**
 * The generic type variables signatures use (`list<T> → T`;
 * `map(list<T>, T => U) → list<U>`). Two variables cover the current
 * catalog; the checker instantiates them per call site.
 */
export const TYPE_VARIABLE_T: FormulaType = { kind: "typevar", name: "T" };
export const TYPE_VARIABLE_U: FormulaType = { kind: "typevar", name: "U" };

/** `list<element>`. */
export function listTypeOf(element: FormulaType): FormulaType {
  return { kind: "list", element };
}

/** `row<databaseId>`; omit the id for "a row of some database". */
export function rowTypeOf(databaseId?: string): FormulaType {
  return databaseId === undefined
    ? { kind: "row" }
    : { kind: "row", databaseId };
}

/** A lambda (function-value) type. */
export function lambdaTypeOf(
  params: readonly FormulaType[],
  returns: FormulaType
): FormulaType {
  return { kind: "lambda", params, returns };
}

/**
 * Unions wider than this collapse to `unknown` — a broader union carries no
 * useful information for diagnostics or the checker.
 */
const MAX_UNION_MEMBERS = 4;

/**
 * Build a flat, deduplicated union. Nested unions flatten, duplicate members
 * (by {@link formulaTypesEqual}) collapse, a lone member returns itself, an
 * `unknown` member (or an oversized result) absorbs the whole union.
 */
export function unionTypeOf(...types: readonly FormulaType[]): FormulaType {
  const members: FormulaType[] = [];
  for (const type of types) {
    const flattened = type.kind === "union" ? type.members : [type];
    for (const member of flattened) {
      if (member.kind === "unknown") {
        return UNKNOWN_TYPE;
      }
      if (!members.some((existing) => formulaTypesEqual(existing, member))) {
        members.push(member);
      }
    }
  }
  if (members.length === 0 || members.length > MAX_UNION_MEMBERS) {
    return UNKNOWN_TYPE;
  }
  if (members.length === 1) {
    return members[0];
  }
  return { kind: "union", members };
}

/** Kinds that carry structure beyond their `kind` tag. */
const STRUCTURED_KINDS = new Set<FormulaType["kind"]>([
  "lambda",
  "list",
  "row",
  "typevar",
  "union",
]);

function lambdaTypesEqual(
  a: Extract<FormulaType, { kind: "lambda" }>,
  b: Extract<FormulaType, { kind: "lambda" }>
): boolean {
  return (
    a.params.length === b.params.length &&
    a.params.every((param, index) =>
      formulaTypesEqual(param, b.params[index])
    ) &&
    formulaTypesEqual(a.returns, b.returns)
  );
}

function unionMembersEqual(
  a: readonly FormulaType[],
  b: readonly FormulaType[]
): boolean {
  return (
    a.length === b.length &&
    a.every((member) => b.some((other) => formulaTypesEqual(member, other)))
  );
}

/** Structural equality; union members compare as a set (order-insensitive). */
export function formulaTypesEqual(a: FormulaType, b: FormulaType): boolean {
  if (a.kind === "list" && b.kind === "list") {
    return formulaTypesEqual(a.element, b.element);
  }
  if (a.kind === "row" && b.kind === "row") {
    return a.databaseId === b.databaseId;
  }
  if (a.kind === "lambda" && b.kind === "lambda") {
    return lambdaTypesEqual(a, b);
  }
  if (a.kind === "union" && b.kind === "union") {
    return unionMembersEqual(a.members, b.members);
  }
  if (a.kind === "typevar" && b.kind === "typevar") {
    return a.name === b.name;
  }
  return a.kind === b.kind && !STRUCTURED_KINDS.has(a.kind);
}

const SINGULAR_NAMES: Partial<Record<FormulaType["kind"], string>> = {
  blank: "blank",
  boolean: "boolean",
  date: "date",
  error: "error",
  lambda: "function",
  number: "number",
  row: "row",
  text: "text",
  unknown: "unknown",
};

const PLURAL_NAMES: Partial<Record<FormulaType["kind"], string>> = {
  blank: "blanks",
  boolean: "booleans",
  date: "dates",
  error: "errors",
  lambda: "functions",
  number: "numbers",
  row: "rows",
  text: "text",
  unknown: "values",
};

function pluralTypeName(type: FormulaType): string {
  if (type.kind === "list") {
    // A generic element carries no information for prose — just "lists".
    return type.element.kind === "typevar"
      ? "lists"
      : `lists of ${pluralTypeName(type.element)}`;
  }
  if (type.kind === "union") {
    return type.members.map(pluralTypeName).join(" or ");
  }
  if (type.kind === "typevar") {
    return type.name;
  }
  return PLURAL_NAMES[type.kind] ?? type.kind;
}

/**
 * Human singular name for a type — "number", "list of numbers", "function".
 * Used by the result-type badge and catalog docs.
 */
export function formulaTypeName(type: FormulaType): string {
  if (type.kind === "list") {
    return `list of ${pluralTypeName(type.element)}`;
  }
  if (type.kind === "union") {
    return type.members.map(formulaTypeName).join(" or ");
  }
  if (type.kind === "typevar") {
    return type.name;
  }
  return SINGULAR_NAMES[type.kind] ?? type.kind;
}

const EXPECTED_PHRASES: Partial<Record<FormulaType["kind"], string>> = {
  blank: "blank",
  boolean: "a boolean",
  date: "a date",
  error: "an error",
  lambda: "a function",
  number: "a number",
  row: "a row",
  text: "text",
  typevar: "a value",
  unknown: "a value",
};

/**
 * The "expects …" phrase for runtime/checker type errors, article included
 * where English wants one — matches the v1 message shapes ("expects a
 * number", "expects text").
 */
export function formulaTypeExpectedPhrase(type: FormulaType): string {
  if (type.kind === "list") {
    return type.element.kind === "typevar"
      ? "a list"
      : `a list of ${pluralTypeName(type.element)}`;
  }
  if (type.kind === "union") {
    return type.members.map(formulaTypeExpectedPhrase).join(" or ");
  }
  return EXPECTED_PHRASES[type.kind] ?? type.kind;
}
