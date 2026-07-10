/**
 * Source-to-source rewriters between the two property-reference spellings:
 * the canonical stored form `prop("<fieldId>")` (rename-proof) and the
 * display form `thisPage.Name` / `thisPage["Name"]` the editor shows. Both
 * rewrite by splicing property-node source spans right-to-left, so the rest
 * of the expression (spacing, casing, comments, everything) is never
 * reformatted. Pure, React-free, and never-throwing: unparseable input
 * passes through unchanged.
 */

import type { FormulaPropertyNode } from "@/lib/formula/ast.ts";
import { walkFormula } from "@/lib/formula/ast.ts";
import { formulaPropertyReference } from "@/lib/formula/catalog.ts";
import { normalizeFormulaPropertyName } from "@/lib/formula/check.ts";
import { parseFormula } from "@/lib/formula/parse.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";

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

function propertyNodesOf(text: string): FormulaPropertyNode[] | null {
  const parsed = parseFormula(text);
  if (!parsed.ok) {
    return null;
  }
  const nodes: FormulaPropertyNode[] = [];
  walkFormula(parsed.ast, (node) => {
    if (node.kind === "property") {
      nodes.push(node);
    }
  });
  return nodes;
}

/** The canonical reference source for a field id (quotes/backslashes escaped). */
export function canonicalPropertyReference(fieldId: string): string {
  const escaped = fieldId.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `prop("${escaped}")`;
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
 * Unresolvable scope names pass through untouched and are reported;
 * `prop("id")` references that match a field id stay as-is; a `prop` whose
 * argument matches neither id nor name is a broken id reference (visible in
 * the UI), not an unresolved name. Unparseable input returns unchanged with
 * `changed: false`.
 */
export function canonicalizeExpression(
  text: string,
  fields: readonly DatabaseField[]
): CanonicalizeExpressionResult {
  const collected = collectCanonicalRewrites(text, fields);
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

/** Shared core of the canonicalizers; `null` when `text` doesn't parse. */
function collectCanonicalRewrites(
  text: string,
  fields: readonly DatabaseField[]
): { rewrites: FormulaSpanRewrite[]; unresolved: string[] } | null {
  const nodes = propertyNodesOf(text);
  if (nodes === null) {
    return null;
  }
  const fieldIds = new Set(fields.map((field) => field.id));
  const byName = fieldsByNormalizedName(fields);
  const rewrites: FormulaSpanRewrite[] = [];
  const unresolved: string[] = [];
  for (const node of nodes) {
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
  return { rewrites, unresolved };
}

/**
 * Inverse of {@link canonicalizeExpression} for display: rewrite every
 * `prop("<id>")` whose id matches a field into `thisPage.Name` (bare
 * identifiers) or `thisPage["Name"]` (escaped) via
 * {@link formulaPropertyReference}. Unknown ids stay as `prop("id")` — a
 * visibly broken reference, not silent data loss. Unparseable input returns
 * unchanged.
 */
export function humanizeExpression(
  text: string,
  fields: readonly DatabaseField[]
): string {
  const nodes = propertyNodesOf(text);
  if (nodes === null) {
    return text;
  }
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  const rewrites: FormulaSpanRewrite[] = [];
  for (const node of nodes) {
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
  return rewrites.length === 0 ? text : spliceRewrites(text, rewrites);
}
