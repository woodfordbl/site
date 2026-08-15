import { canonicalizeExpression } from "@/lib/formula/ref-rewrite.ts";
import type { LocalDatabase } from "@/lib/schemas/database.ts";

/**
 * Startup canonicalization of stored formula expressions: rewrites
 * name-based references (`thisPage.X`) to the field-id form (`prop("<id>")`)
 * so renaming a field never breaks a formula. Idempotent — already-canonical
 * expressions come back `changed: false` and nothing is written — and
 * lossless: unparseable expressions and unresolvable names pass through
 * untouched (they surface as errors in the UI, not here). The writer is
 * injected so this module stays out of the collections import graph; the
 * caller (`startLocalCollectionsSync`) is browser-only and SSR-guarded.
 */

/**
 * fieldId → canonical expression for the formula fields whose stored text
 * actually changes under canonicalization (schema order preserved).
 */
export function changedFormulaExpressions(
  database: LocalDatabase
): Map<string, string> {
  const changes = new Map<string, string>();
  for (const field of database.fields) {
    if (field.type !== "formula") {
      continue;
    }
    const canonical = canonicalizeExpression(field.expression, database.fields);
    if (canonical.changed) {
      changes.set(field.id, canonical.text);
    }
  }
  return changes;
}

/** Persists one formula field's canonical expression. */
export type WriteFormulaExpression = (
  databaseId: string,
  fieldId: string,
  expression: string
) => void;

/**
 * Canonicalize every database's formula expressions in place; only fields
 * whose expression actually changes are written.
 */
export function migrateFormulaExpressionsToIdRefs(
  databases: readonly LocalDatabase[],
  writeExpression: WriteFormulaExpression
): void {
  for (const database of databases) {
    for (const [fieldId, expression] of changedFormulaExpressions(database)) {
      writeExpression(database.id, fieldId, expression);
    }
  }
}
