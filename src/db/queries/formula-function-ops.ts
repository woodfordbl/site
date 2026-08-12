import { localFormulaFunctionsCollection } from "@/db/collections/local-collections.ts";
import {
  formulaUserFunctionNameError,
  formulaUserFunctionParamsError,
} from "@/lib/formula/user-functions.ts";
import type { LocalFormulaFunction } from "@/lib/schemas/local-formula-function.ts";

/**
 * CRUD for named user-defined formula functions
 * (`localFormulaFunctionsCollection` — workspace-level, like keybindings).
 * Writes follow the keybindings pattern (direct collection ops, no
 * transaction — single-collection, single-row); the NAME/PARAM rules are
 * enforced HERE at write time via the pure validators
 * (`lib/formula/user-functions.ts`): identifier-safe per the real
 * tokenizer, no reserved words or reference roots, no catalog
 * name/alias collisions, and case-insensitive global uniqueness. Invalid
 * input returns the validation message instead of writing, so a broken
 * definition can never enter the collection through this module.
 */

function nowIso(): string {
  return new Date().toISOString();
}

/** Every stored definition, name-sorted for stable UI listings. */
export function listFormulaFunctions(): LocalFormulaFunction[] {
  return [...localFormulaFunctionsCollection.toArray].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

/** Names taken by OTHER definitions (uniqueness pool for validation). */
function takenNames(excludeId?: string): string[] {
  return localFormulaFunctionsCollection.toArray
    .filter((fn) => fn.id !== excludeId)
    .map((fn) => fn.name);
}

/**
 * Why a definition write would be invalid, or `null` when it's clean —
 * shared by create/update and exported for the (next-pass) management UI's
 * inline validation. `excludeId` skips the definition being renamed.
 */
export function formulaFunctionValidationError(
  name: string,
  params: readonly string[],
  excludeId?: string
): string | null {
  return (
    formulaUserFunctionNameError(name, takenNames(excludeId)) ??
    formulaUserFunctionParamsError(params)
  );
}

/** Inputs of {@link createFormulaFunction}. */
export interface CreateFormulaFunctionInput {
  description?: string;
  expression: string;
  name: string;
  params: readonly string[];
}

/** One op's outcome: the written row, or the validation message. */
export type FormulaFunctionOpResult =
  | { ok: true; fn: LocalFormulaFunction }
  | { ok: false; error: string };

/** Create a definition; name/param rules validate before the write. */
export function createFormulaFunction(
  input: CreateFormulaFunctionInput
): FormulaFunctionOpResult {
  const error = formulaFunctionValidationError(input.name, input.params);
  if (error !== null) {
    return { error, ok: false };
  }
  const timestamp = nowIso();
  const fn: LocalFormulaFunction = {
    createdAt: timestamp,
    ...(input.description === undefined
      ? {}
      : { description: input.description }),
    expression: input.expression,
    id: crypto.randomUUID(),
    name: input.name,
    params: [...input.params],
    updatedAt: timestamp,
  };
  localFormulaFunctionsCollection.insert(fn);
  return { fn, ok: true };
}

/** Sparse patch of {@link updateFormulaFunction}. */
export interface UpdateFormulaFunctionPatch {
  description?: string;
  expression?: string;
  name?: string;
  params?: readonly string[];
}

/**
 * Update a definition (rename revalidates against the OTHER definitions'
 * names; a params change revalidates the list). Unknown ids are a no-op
 * error, never a throw.
 */
export function updateFormulaFunction(
  id: string,
  patch: UpdateFormulaFunctionPatch
): FormulaFunctionOpResult {
  const existing = localFormulaFunctionsCollection.get(id);
  if (existing === undefined) {
    return { error: "This function no longer exists", ok: false };
  }
  const name = patch.name ?? existing.name;
  const params = patch.params ?? existing.params;
  const error = formulaFunctionValidationError(name, params, id);
  if (error !== null) {
    return { error, ok: false };
  }
  localFormulaFunctionsCollection.update(id, (draft) => {
    draft.name = name;
    draft.params = [...params];
    if (patch.expression !== undefined) {
      draft.expression = patch.expression;
    }
    if (patch.description !== undefined) {
      draft.description = patch.description;
    }
    draft.updatedAt = nowIso();
  });
  const fn = localFormulaFunctionsCollection.get(id);
  return fn === undefined
    ? { error: "This function no longer exists", ok: false }
    : { fn, ok: true };
}

/** Delete a definition; unknown ids no-op (idempotent). */
export function deleteFormulaFunction(id: string): void {
  if (localFormulaFunctionsCollection.has(id)) {
    localFormulaFunctionsCollection.delete(id);
  }
}
