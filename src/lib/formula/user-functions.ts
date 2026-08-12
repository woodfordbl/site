/**
 * Named user-defined functions for the v2 formula language (proposal §9 P5,
 * the Sheets Named Functions model): a definition — name, parameter names,
 * body expression — stored once at workspace level and callable from any
 * formula. This module is the pure half: {@link prepareUserFunctions} parses
 * each body ONCE into the registry the checker/evaluator/reference walker
 * consume, and the name/parameter validators enforce the identifier rules at
 * write time (the ops layer in `db/queries/formula-function-ops.ts` calls
 * them before touching the collection).
 *
 * Name rules — a function name must:
 * - lex as exactly one identifier token (the REAL tokenizer decides, the
 *   same never-drifts discipline as `rollup-template.ts`);
 * - avoid the grammar's reserved words (`true`/`and`/…), the reference
 *   roots (`prop`/`db`/`thisPage`/`thisRow` — a call would re-enter the
 *   reference grammar), and the evaluator special forms (`let`/`lets`,
 *   which are matched before any function lookup);
 * - avoid every catalog function name AND alias (catalog-first resolution
 *   means such a definition could never be called);
 * - be unique among definitions case-insensitively (lookups are
 *   case-insensitive, like the catalog's).
 *
 * Parameter names follow the lambda-parameter rules (identifier, not
 * reserved, no duplicates) plus the reference-root exclusion a `let`
 * statement name gets — a parameter named `prop` could never be read back.
 */

import { formulaFunctionForName } from "@/lib/formula/catalog.ts";
import {
  FORMULA_DB_ROOT,
  FORMULA_PROP_ROOT,
  FORMULA_RESERVED_WORDS,
  FORMULA_SCOPE_ROOTS,
  parseFormula,
} from "@/lib/formula/parse.ts";
import { tokenizeFormula } from "@/lib/formula/tokenize.ts";
import type {
  FormulaPreparedUserFunction,
  FormulaPreparedUserFunctions,
  FormulaUserFunction,
} from "@/lib/formula/values.ts";

/**
 * Names the evaluator/checker match BEFORE any function lookup (`let`/`lets`
 * special forms) plus the reference syntax roots — a definition or parameter
 * under any of these could never be called/read back.
 */
const UNCALLABLE_NAMES: ReadonlySet<string> = new Set([
  FORMULA_PROP_ROOT,
  FORMULA_DB_ROOT,
  ...FORMULA_SCOPE_ROOTS,
  "let",
  "lets",
]);

/**
 * Whether `name` lexes as exactly one identifier token equal to itself —
 * the tokenizer is the single grammar truth, so this can never drift from
 * what the parser accepts as a call name.
 */
function isSingleIdentifier(name: string): boolean {
  const lexed = tokenizeFormula(name);
  if (!lexed.ok || lexed.tokens.length !== 2) {
    return false;
  }
  const token = lexed.tokens[0];
  return token.type === "identifier" && token.value === name;
}

/**
 * Why `name` can't name a user-defined function, or `null` when it can.
 * `takenNames` are the OTHER definitions' names (uniqueness is
 * case-insensitive); pass the current name's siblings when renaming.
 * Catalog collisions check names AND aliases through the catalog's own
 * case-insensitive lookup (`formulaFunctionForName`).
 */
export function formulaUserFunctionNameError(
  name: string,
  takenNames: readonly string[] = []
): string | null {
  if (name.trim() === "") {
    return "Function names can't be empty";
  }
  if (!isSingleIdentifier(name)) {
    return `"${name}" isn't a valid function name — use letters, digits, and underscores, starting with a letter`;
  }
  const lower = name.toLowerCase();
  if (FORMULA_RESERVED_WORDS.has(lower) || UNCALLABLE_NAMES.has(lower)) {
    return `"${name}" is reserved and can't name a function`;
  }
  if (formulaFunctionForName(name) !== undefined) {
    return `"${name}" is already a built-in function`;
  }
  if (takenNames.some((taken) => taken.toLowerCase() === lower)) {
    return `A function named "${name}" already exists`;
  }
  return null;
}

/**
 * Why `params` can't be a user-defined function's parameter list, or `null`
 * when it can: every name an identifier, none reserved (lambda-parameter
 * rule) or a reference root (`let`-statement rule), no exact duplicates
 * (the grammar's own duplicate-parameter rule — binding lookup is
 * case-sensitive, so `a`/`A` coexist like lambda parameters do).
 */
export function formulaUserFunctionParamsError(
  params: readonly string[]
): string | null {
  const seen = new Set<string>();
  for (const param of params) {
    if (!isSingleIdentifier(param)) {
      return `"${param}" isn't a valid parameter name`;
    }
    const lower = param.toLowerCase();
    if (FORMULA_RESERVED_WORDS.has(lower) || UNCALLABLE_NAMES.has(lower)) {
      return `"${param}" is reserved and can't be a parameter name`;
    }
    if (seen.has(param)) {
      return `Duplicate parameter name "${param}"`;
    }
    seen.add(param);
  }
  return null;
}

/**
 * Human signature for a definition — `weightedScore(points, weight)` — for
 * the editor's reference list and completions (the catalog's
 * `formulaFunctionSignature` shape).
 */
export function formulaUserFunctionSignature(
  def: Pick<FormulaUserFunction, "name" | "params">
): string {
  return `${def.name}(${def.params.join(", ")})`;
}

/**
 * Parse every definition's body ONCE into the prepared registry (lowercased
 * name keys). A blank or unparseable body prepares with `body: null` plus
 * the parse-error message — callers surface the broken definition at the
 * CALL site ({@link formulaUserFunctionBrokenMessage}), never crash on it.
 * Duplicate names (case-insensitive) keep the first definition, mirroring
 * the schema-order rule property-name collisions use. Never throws.
 */
export function prepareUserFunctions(
  defs: readonly FormulaUserFunction[]
): FormulaPreparedUserFunctions {
  const prepared = new Map<string, FormulaPreparedUserFunction>();
  for (const def of defs) {
    const key = def.name.toLowerCase();
    if (prepared.has(key)) {
      continue;
    }
    let body: FormulaPreparedUserFunction["body"] = null;
    let bodyError: string | null = null;
    if (def.expression.trim() === "") {
      bodyError = "The function has no expression yet";
    } else {
      const parsed = parseFormula(def.expression);
      if (parsed.ok) {
        body = parsed.ast;
      } else {
        bodyError = parsed.error.message;
      }
    }
    prepared.set(key, {
      body,
      bodyError,
      ...(def.description === undefined
        ? {}
        : { description: def.description }),
      name: def.name,
      params: def.params,
    });
  }
  return prepared;
}
