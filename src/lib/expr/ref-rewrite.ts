/**
 * Source-to-source rewriters between the two property-reference spellings:
 * the canonical stored form `prop("<fieldId>")` (rename-proof) and the
 * display form `thisPage.Name` / `thisPage["Name"]` the editor shows. Both
 * rewrite by splicing property-node source spans right-to-left, so the rest
 * of the expression (spacing, casing, everything) is never reformatted.
 * Pure, React-free, and never-throwing: unparseable input passes through
 * unchanged.
 */

import { formulaPropertyReference } from "@/lib/expr/function-catalog.ts";
import {
  type ExprNode,
  type ExprPropertyNode,
  parseExpression,
} from "@/lib/expr/parse.ts";
import { normalizePropertyName } from "@/lib/expr/row-scope.ts";
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

function collectPropertyNodes(
  node: ExprNode,
  out: ExprPropertyNode[]
): ExprPropertyNode[] {
  switch (node.kind) {
    case "property":
      out.push(node);
      break;
    case "unary":
      collectPropertyNodes(node.operand, out);
      break;
    case "binary":
      collectPropertyNodes(node.left, out);
      collectPropertyNodes(node.right, out);
      break;
    case "call":
      for (const arg of node.args) {
        collectPropertyNodes(arg, out);
      }
      break;
    default:
      break;
  }
  return out;
}

function propertyNodesOf(text: string): ExprPropertyNode[] | null {
  const parsed = parseExpression(text);
  return parsed.ok ? collectPropertyNodes(parsed.ast, []) : null;
}

/** The canonical reference source for a field id (quotes/backslashes escaped). */
function propReference(fieldId: string): string {
  const escaped = fieldId.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `prop("${escaped}")`;
}

interface SpanRewrite {
  end: number;
  start: number;
  text: string;
}

/** Splice replacements right-to-left so earlier spans' offsets stay valid. */
function spliceRewrites(source: string, rewrites: SpanRewrite[]): string {
  const ordered = [...rewrites].sort((a, b) => b.start - a.start);
  let result = source;
  for (const rewrite of ordered) {
    result =
      result.slice(0, rewrite.start) + rewrite.text + result.slice(rewrite.end);
  }
  return result;
}

/**
 * Rewrite every scope-syntax reference (`thisPage.X` / `thisRow["X"]`) whose
 * name resolves to a field into the canonical `prop("<fieldId>")` form. Name
 * resolution matches `createRowScope`: normalized (trimmed, lowercased),
 * first field in schema order wins on collisions. Unresolvable names and
 * already-canonical `prop("id")` references pass through untouched;
 * unparseable input returns unchanged with `changed: false`.
 */
export function canonicalizeExpression(
  text: string,
  fields: readonly DatabaseField[]
): CanonicalizeExpressionResult {
  const nodes = propertyNodesOf(text);
  if (nodes === null) {
    return { text, changed: false, unresolved: [] };
  }
  const fieldsByName = new Map<string, DatabaseField>();
  for (const field of fields) {
    const key = normalizePropertyName(field.name);
    if (!fieldsByName.has(key)) {
      fieldsByName.set(key, field);
    }
  }
  const rewrites: SpanRewrite[] = [];
  const unresolved: string[] = [];
  for (const node of nodes) {
    if (node.via !== "scope") {
      continue;
    }
    const field = fieldsByName.get(normalizePropertyName(node.name));
    if (field === undefined) {
      unresolved.push(node.name);
      continue;
    }
    rewrites.push({
      start: node.position,
      end: node.end,
      text: propReference(field.id),
    });
  }
  if (rewrites.length === 0) {
    return { text, changed: false, unresolved };
  }
  return { text: spliceRewrites(text, rewrites), changed: true, unresolved };
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
  const rewrites: SpanRewrite[] = [];
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
