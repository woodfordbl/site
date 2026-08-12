/**
 * Source-to-source rewriters between the two reference spellings: the
 * canonical stored forms `prop("<fieldId>")` / `db("<databaseId>")`
 * (rename-proof, id-keyed) and the display forms `thisPage.Name` /
 * `thisPage["Name"]` / `db("Enrollments")` the editor shows. Both rewrite by
 * splicing reference-node source spans right-to-left, so the rest of the
 * expression (spacing, casing, comments, everything) is never reformatted.
 * Pure, React-free, and never-throwing: unparseable input passes through
 * unchanged.
 */

import type {
  FormulaDatabaseNode,
  FormulaPropertyNode,
} from "@/lib/formula/ast.ts";
import { walkFormula } from "@/lib/formula/ast.ts";
import { formulaPropertyReference } from "@/lib/formula/catalog.ts";
import { normalizeFormulaPropertyName } from "@/lib/formula/check.ts";
import { parseFormula } from "@/lib/formula/parse.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";

/**
 * One database visible to `db("…")` canonicalization/humanization — the
 * caller supplies every database of the workspace (`id` + display `name`).
 * Optional at every entry point: without it, db references pass through
 * untouched, so property-only call sites are unaffected.
 */
export interface FormulaRefDatabase {
  readonly id: string;
  readonly name: string;
}

/** Result of {@link canonicalizeExpression}. */
export interface CanonicalizeExpressionResult {
  /** Whether any reference was rewritten (`text` differs from the input). */
  changed: boolean;
  text: string;
  /**
   * Name references that matched no field (left untouched in `text`), in
   * source order.
   */
  unresolved: string[];
}

/** Both reference-node kinds of a parsed expression, in walk order. */
interface ReferenceNodes {
  databases: FormulaDatabaseNode[];
  properties: FormulaPropertyNode[];
}

function referenceNodesOf(text: string): ReferenceNodes | null {
  const parsed = parseFormula(text);
  if (!parsed.ok) {
    return null;
  }
  const nodes: ReferenceNodes = { databases: [], properties: [] };
  walkFormula(parsed.ast, (node) => {
    if (node.kind === "property") {
      nodes.properties.push(node);
    } else if (node.kind === "database") {
      nodes.databases.push(node);
    }
  });
  return nodes;
}

function escapeQuoted(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

/** The canonical reference source for a field id (quotes/backslashes escaped). */
export function canonicalPropertyReference(fieldId: string): string {
  return `prop("${escapeQuoted(fieldId)}")`;
}

/**
 * The `db("…")` reference source for a database id — or, since the display
 * form shares the syntax, for a database NAME when humanizing.
 */
export function canonicalDatabaseReference(reference: string): string {
  return `db("${escapeQuoted(reference)}")`;
}

/** One source splice: replace `[start, end)` with `text`. */
export interface FormulaSpanRewrite {
  end: number;
  start: number;
  text: string;
}

/** Splice replacements right-to-left so earlier spans' offsets stay valid. */
function spliceRewrites(
  source: string,
  rewrites: readonly FormulaSpanRewrite[]
): string {
  const ordered = [...rewrites].sort((a, b) => b.start - a.start);
  let result = source;
  for (const rewrite of ordered) {
    result =
      result.slice(0, rewrite.start) + rewrite.text + result.slice(rewrite.end);
  }
  return result;
}

/** Name-keyed field index: normalized name → first field in schema order. */
function fieldsByNormalizedName(
  fields: readonly DatabaseField[]
): Map<string, DatabaseField> {
  const byName = new Map<string, DatabaseField>();
  for (const field of fields) {
    const key = normalizeFormulaPropertyName(field.name);
    if (!byName.has(key)) {
      byName.set(key, field);
    }
  }
  return byName;
}

/**
 * Rewrite every property reference whose name resolves to a field into the
 * canonical `prop("<fieldId>")` form:
 *
 * - Scope syntax (`thisPage.X` / `thisRow["X"]`) resolves by name exactly
 *   like `createFormulaRowScope` — normalized (trimmed, lowercased), first
 *   field in schema order wins on collisions.
 * - `prop("X")` where X is NOT a field id but normalizes to a field NAME
 *   also rewrites to `prop("<id>")`, so a pasted name-form `prop` reference
 *   canonicalizes instead of only working by the evaluator's name fallback
 *   (checker and runtime then agree on what it means).
 *
 * `db("…")` references canonicalize by the same rule when `databases` is
 * supplied: an argument matching a database ID stays, one matching a
 * database NAME (normalized, first in list order on collisions) rewrites to
 * the id form, and one matching neither stays as a visibly broken reference
 * — not an unresolved name, exactly like `prop`.
 *
 * Unresolvable scope names pass through untouched and are reported;
 * `prop("id")` references that match a field id stay as-is; a `prop` whose
 * argument matches neither id nor name is a broken id reference (visible in
 * the UI), not an unresolved name. Unparseable input returns unchanged with
 * `changed: false`.
 */
export function canonicalizeExpression(
  text: string,
  fields: readonly DatabaseField[],
  databases?: readonly FormulaRefDatabase[]
): CanonicalizeExpressionResult {
  const collected = collectCanonicalRewrites(text, fields, databases);
  if (collected === null) {
    return { text, changed: false, unresolved: [] };
  }
  const { rewrites, unresolved } = collected;
  if (rewrites.length === 0) {
    return { text, changed: false, unresolved };
  }
  return { text: spliceRewrites(text, rewrites), changed: true, unresolved };
}

/**
 * The individual span rewrites {@link canonicalizeExpression} would apply, in
 * source order, without applying them — the CM6 editor converts completed
 * display references to chips one span at a time so it can skip any span the
 * caret is still touching. Empty for unparseable input.
 */
export function canonicalPropertyRewrites(
  text: string,
  fields: readonly DatabaseField[]
): FormulaSpanRewrite[] {
  return collectCanonicalRewrites(text, fields)?.rewrites ?? [];
}

/** Name-keyed database index: normalized name → first database in order. */
function databasesByNormalizedName(
  databases: readonly FormulaRefDatabase[]
): Map<string, FormulaRefDatabase> {
  const byName = new Map<string, FormulaRefDatabase>();
  for (const database of databases) {
    const key = normalizeFormulaPropertyName(database.name);
    if (!byName.has(key)) {
      byName.set(key, database);
    }
  }
  return byName;
}

/**
 * Canonical rewrites for `db("…")` nodes: id references stay, name
 * references rewrite to the id form, anything else is a broken reference
 * left visible. No-op without a databases list.
 */
function collectDatabaseRewrites(
  nodes: readonly FormulaDatabaseNode[],
  databases: readonly FormulaRefDatabase[] | undefined,
  rewrites: FormulaSpanRewrite[]
): void {
  if (databases === undefined || nodes.length === 0) {
    return;
  }
  const ids = new Set(databases.map((database) => database.id));
  const byName = databasesByNormalizedName(databases);
  for (const node of nodes) {
    if (ids.has(node.databaseId)) {
      continue;
    }
    const database = byName.get(normalizeFormulaPropertyName(node.databaseId));
    if (database === undefined) {
      continue;
    }
    rewrites.push({
      start: node.position,
      end: node.end,
      text: canonicalDatabaseReference(database.id),
    });
  }
}

/** Shared core of the canonicalizers; `null` when `text` doesn't parse. */
function collectCanonicalRewrites(
  text: string,
  fields: readonly DatabaseField[],
  databases?: readonly FormulaRefDatabase[]
): { rewrites: FormulaSpanRewrite[]; unresolved: string[] } | null {
  const nodes = referenceNodesOf(text);
  if (nodes === null) {
    return null;
  }
  const fieldIds = new Set(fields.map((field) => field.id));
  const byName = fieldsByNormalizedName(fields);
  const rewrites: FormulaSpanRewrite[] = [];
  const unresolved: string[] = [];
  for (const node of nodes.properties) {
    if (node.via === "prop" && fieldIds.has(node.name)) {
      continue;
    }
    const field = byName.get(normalizeFormulaPropertyName(node.name));
    if (field === undefined) {
      if (node.via === "scope") {
        unresolved.push(node.name);
      }
      continue;
    }
    rewrites.push({
      start: node.position,
      end: node.end,
      text: canonicalPropertyReference(field.id),
    });
  }
  collectDatabaseRewrites(nodes.databases, databases, rewrites);
  return { rewrites, unresolved };
}

/**
 * Inverse of {@link canonicalizeExpression} for display: rewrite every
 * `prop("<id>")` whose id matches a field into `thisPage.Name` (bare
 * identifiers) or `thisPage["Name"]` (escaped) via
 * {@link formulaPropertyReference}, and — when `databases` is supplied —
 * every `db("<id>")` whose id matches a database into `db("Name")`.
 * Unknown ids stay as `prop("id")` / `db("id")` — visibly broken
 * references, not silent data loss. Unparseable input returns unchanged.
 */
export function humanizeExpression(
  text: string,
  fields: readonly DatabaseField[],
  databases?: readonly FormulaRefDatabase[]
): string {
  const nodes = referenceNodesOf(text);
  if (nodes === null) {
    return text;
  }
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  const rewrites: FormulaSpanRewrite[] = [];
  for (const node of nodes.properties) {
    if (node.via !== "prop") {
      continue;
    }
    const field = fieldsById.get(node.name);
    if (field === undefined) {
      continue;
    }
    rewrites.push({
      start: node.position,
      end: node.end,
      text: formulaPropertyReference(field.name),
    });
  }
  const databasesById = new Map(
    (databases ?? []).map((database) => [database.id, database])
  );
  for (const node of nodes.databases) {
    const database = databasesById.get(node.databaseId);
    if (database === undefined) {
      continue;
    }
    rewrites.push({
      start: node.position,
      end: node.end,
      text: canonicalDatabaseReference(database.name),
    });
  }
  return rewrites.length === 0 ? text : spliceRewrites(text, rewrites);
}
