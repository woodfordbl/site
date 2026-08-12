import {
  type FormulaCheckProperty,
  normalizeFormulaPropertyName,
} from "@/lib/formula/check.ts";
import { DATE_TYPE, TEXT_TYPE } from "@/lib/formula/types.ts";
import {
  FormulaDate,
  type FormulaPreparedUserFunctions,
  type FormulaRelationResolver,
  type FormulaScope,
  type FormulaValue,
  formulaError,
} from "@/lib/formula/values.ts";

/**
 * The `thisPage` scope for an ORDINARY page — the one inline prose tokens
 * evaluate against (`docs/proposals/inline-prose-tokens.md`).
 *
 * Every page carries a small set of base fields, so `{{ thisPage.UpdatedAt }}`
 * works in any prose. A database ROW page is a superset: the row's own fields
 * on top of these, with database fields winning a name collision. That layering
 * is P2 — this module owns the base half, and is deliberately free of any
 * database types.
 *
 * `db("…")` reads work here exactly as they do in a formula column: they go
 * through the scope's relation resolver, not through `thisPage`.
 */

/** The page shape these fields read; structural, so callers can pass a `LocalPage`. */
export interface PageFormulaSource {
  readonly createdAt: string;
  readonly title: string;
  readonly updatedAt: string;
}

interface BaseFieldDefinition {
  /** Stable id, also the `prop("…")` canonical form. */
  readonly id: string;
  readonly name: string;
  readonly read: (page: PageFormulaSource) => FormulaValue;
  readonly type: typeof DATE_TYPE | typeof TEXT_TYPE;
}

/** An ISO string as a date value, or blank when it will not parse. */
function isoDate(raw: string): FormulaValue {
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : new FormulaDate(parsed, false);
}

/**
 * Base fields available on every page. Ids are prefixed so they can never
 * collide with a database field id, which matters once row pages layer the two
 * (a database field id is a generated `f-…`/uuid, never `page:…`).
 */
const BASE_FIELDS: readonly BaseFieldDefinition[] = [
  {
    id: "page:title",
    name: "Title",
    type: TEXT_TYPE,
    read: (page) => page.title,
  },
  {
    id: "page:createdAt",
    name: "Created at",
    type: DATE_TYPE,
    read: (page) => isoDate(page.createdAt),
  },
  {
    id: "page:updatedAt",
    name: "Updated at",
    type: DATE_TYPE,
    read: (page) => isoDate(page.updatedAt),
  },
];

const BY_ID = new Map(BASE_FIELDS.map((field) => [field.id, field]));
const BY_NAME = new Map(
  BASE_FIELDS.map((field) => [normalizeFormulaPropertyName(field.name), field])
);

/**
 * Base fields as checker properties, so the editor types `thisPage.X`, offers
 * completions, and diagnoses a typo — the same context a formula column gets.
 */
export function pageFormulaCheckProperties(): FormulaCheckProperty[] {
  return BASE_FIELDS.map((field) => ({
    id: field.id,
    kind: field.type === DATE_TYPE ? ("date" as const) : ("text" as const),
    name: field.name,
    type: field.type,
  }));
}

/** Whether `name` (id or display name) is a base page field. */
export function isBasePageField(name: string): boolean {
  return BY_ID.has(name) || BY_NAME.has(normalizeFormulaPropertyName(name));
}

export interface CreatePageFormulaScopeOptions {
  readonly now?: () => Date;
  readonly relations?: FormulaRelationResolver;
  readonly userFunctions?: FormulaPreparedUserFunctions;
}

/**
 * A {@link FormulaScope} over `page`'s base fields. Property lookup accepts the
 * canonical id or the display name (case-insensitively, the same rule
 * everywhere else), and an unknown name is an error VALUE, never a throw.
 */
export function createPageFormulaScope(
  page: PageFormulaSource,
  opts?: CreatePageFormulaScopeOptions
): FormulaScope {
  const getProperty = (name: string): FormulaValue => {
    const field =
      BY_ID.get(name) ?? BY_NAME.get(normalizeFormulaPropertyName(name));
    if (field === undefined) {
      return formulaError(`Unknown property "${name}"`);
    }
    return field.read(page);
  };
  const scope: FormulaScope = { getProperty };
  if (opts?.now !== undefined) {
    scope.now = opts.now;
  }
  if (opts?.relations !== undefined) {
    scope.relations = opts.relations;
  }
  if (opts?.userFunctions !== undefined) {
    scope.userFunctions = opts.userFunctions;
  }
  return scope;
}
