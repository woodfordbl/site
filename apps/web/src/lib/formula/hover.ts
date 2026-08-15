import type { FormulaNode } from "./ast.ts";
import { formulaNodeChildren, walkFormula } from "./ast.ts";
import { formulaFunctionForName, formulaFunctionSignature } from "./catalog.ts";
import {
  checkFormula,
  type FormulaCheckContext,
  formulaTypeBadge,
} from "./check.ts";
import { formulaValueToDisplay } from "./display.ts";
import { evaluateFormula } from "./evaluate.ts";
import { parseFormula } from "./parse.ts";
import type { FormulaScope } from "./values.ts";

/**
 * Editor hover ("what is this subexpression?"), the language side of the
 * formula editor's LSP-style tooltip. Given the CANONICAL source and a caret
 * offset it resolves the innermost node under the cursor, its statically
 * synthesized type, and — when the caller supplies a preview scope — what
 * that subexpression actually evaluates to for that row.
 *
 * Pure and never-throwing like the rest of `lib/formula`: unparseable input,
 * an offset past the end, and evaluation blowups all degrade to `null` or an
 * error string rather than propagating. The editor's document IS the
 * canonical text (chips are decorations over it), so offsets need no
 * translation on the way in.
 */

/** How wide a source slice a hover label will show before eliding. */
const MAX_LABEL_LENGTH = 48;

/** Trailing whitespace, trimmed before looking for a doc comment. */
const TRAILING_WHITESPACE = /\s+$/;

/** A jsdoc-style decorative leading `*` on a block-comment line. */
const LEADING_STAR = /^\*\s?/;

/** Runs of whitespace collapsed when a label is built from source. */
const WHITESPACE_RUN = /\s+/g;

/** The `(…)` prefix an LSP-style head line opens with. */
export type FormulaHoverKind =
  | "database"
  | "expression"
  | "function"
  | "literal"
  | "property"
  | "variable";

export interface FormulaHoverInfo {
  /**
   * Prose about the hovered node, rendered under the head line: a catalog
   * function's description, or the `//` / `/* … *​/` doc comment written
   * immediately above the node's line (see {@link docCommentAbove}).
   */
  readonly description?: string;
  /** Exclusive end of the hovered node's span, for tooltip positioning. */
  readonly end: number;
  /**
   * What kind of thing this is, rendered as the head line's `(…)` prefix the
   * way an LSP hover does: `property`, `database`, `function`, `variable`,
   * `literal`, or `expression`.
   */
  readonly kind: FormulaHoverKind;
  /**
   * Human label for the hovered node: a friendly `Property` / `Database`
   * name for reference nodes, `fn(…)` for a call, otherwise the source
   * slice (elided past {@link MAX_LABEL_LENGTH}).
   */
  readonly label: string;
  readonly start: number;
  /** Display badge for the synthesized type, e.g. `number`, `list of row`. */
  readonly type: string;
  /**
   * What this subexpression evaluates to against the supplied scope, already
   * display-formatted. `null` when no scope was given (nothing to evaluate
   * against) or the node isn't independently evaluable — a lambda body
   * referencing its parameter, say, whose bindings only exist mid-call.
   */
  readonly value: string | null;
}

export interface FormulaHoverOptions {
  /** Schema/type context — the same one the diagnostics pass uses. */
  readonly context: FormulaCheckContext;
  /** Row label resolver threaded into value display (relation rows). */
  readonly rowLabel?: Parameters<typeof formulaValueToDisplay>[1];
  /**
   * Scope the hovered subexpression evaluates against — the panel's preview
   * row. Omitted, hovers still report types and skip values.
   */
  readonly scope?: FormulaScope;
}

/**
 * The innermost node whose span contains `offset`. Ties (a node sharing its
 * parent's span, which grouping parens produce) resolve to the deepest, since
 * the walk visits parents first and each strictly-narrower child replaces it.
 */
function innermostNodeAt(
  root: FormulaNode,
  offset: number
): FormulaNode | null {
  let found: FormulaNode | null = null;
  walkFormula(root, (node) => {
    if (offset < node.position || offset >= node.end) {
      // Not on this branch — but siblings may still match, so keep walking.
      return true;
    }
    if (
      found === null ||
      node.end - node.position <= found.end - found.position
    ) {
      found = node;
    }
    return true;
  });
  return found;
}

/** Display name for a `prop("<id>")` id, falling back to the raw id. */
function propertyName(id: string, context: FormulaCheckContext): string {
  return context.properties.find((property) => property.id === id)?.name ?? id;
}

/** Display name for a `db("<id>")` id, falling back to the raw id. */
function databaseName(id: string, context: FormulaCheckContext): string {
  return context.databases?.get(id)?.name ?? id;
}

/**
 * The node's source text with reference spans swapped for their display
 * names, so the tooltip reads like the editor looks (`Estimate * Rate`, not
 * `prop("t-est") * prop("t-rate")`). Splices right-to-left so earlier spans
 * keep their offsets, mirroring `ref-rewrite`'s discipline — done here off
 * the check context rather than via `humanizeExpression`, which would couple
 * this package to the database schema types.
 */
function humanizedSlice(
  node: FormulaNode,
  source: string,
  context: FormulaCheckContext
): string {
  const rewrites: { end: number; start: number; text: string }[] = [];
  walkFormula(node, (child) => {
    if (child.kind === "property" && child.via === "prop") {
      rewrites.push({
        end: child.end,
        start: child.position,
        text: propertyName(child.name, context),
      });
    } else if (child.kind === "database") {
      rewrites.push({
        end: child.end,
        start: child.position,
        text: `db("${databaseName(child.databaseId, context)}")`,
      });
    }
    return true;
  });
  let text = source.slice(node.position, node.end);
  for (const rewrite of rewrites.sort((a, b) => b.start - a.start)) {
    const from = rewrite.start - node.position;
    const to = rewrite.end - node.position;
    text = text.slice(0, from) + rewrite.text + text.slice(to);
  }
  return text.replace(WHITESPACE_RUN, " ");
}

/** Friendly label for reference nodes; humanized source for everything else. */
function labelFor(
  node: FormulaNode,
  source: string,
  context: FormulaCheckContext
): string {
  if (node.kind === "property") {
    return node.via === "prop" ? propertyName(node.name, context) : node.name;
  }
  if (node.kind === "database") {
    return databaseName(node.databaseId, context);
  }
  const slice = humanizedSlice(node, source, context);
  return slice.length > MAX_LABEL_LENGTH
    ? `${slice.slice(0, MAX_LABEL_LENGTH - 1)}…`
    : slice;
}

/** What the head line's `(…)` prefix calls this node. */
function hoverKindOf(
  node: FormulaNode,
  isCatalogCall: boolean
): FormulaHoverKind {
  if (node.kind === "property") {
    return "property";
  }
  if (node.kind === "database") {
    return "database";
  }
  if (node.kind === "call") {
    return isCatalogCall ? "function" : "expression";
  }
  if (node.kind === "name") {
    // `let` bindings and lambda parameters both parse to bare name nodes.
    return "variable";
  }
  return node.kind === "literal" ? "literal" : "expression";
}

/**
 * Doc comment written immediately above the hovered node's line — a run of
 * `//` lines or one block comment ending on the previous line. Deliberately
 * lightweight: comments never reach the AST (the tokenizer drops them), so
 * this reads the raw source, and a blank line ends the block the way every
 * doc-comment convention does.
 */
function docCommentAbove(source: string, position: number): string | undefined {
  const lineStart = source.lastIndexOf("\n", position - 1) + 1;
  const before = source.slice(0, lineStart).replace(TRAILING_WHITESPACE, "");
  if (before === "") {
    return;
  }
  if (before.endsWith("*/")) {
    const open = before.lastIndexOf("/*");
    if (open < 0) {
      return;
    }
    const body = before.slice(open + 2, before.length - 2);
    const text = body
      .split("\n")
      // Strip a leading decorative `*` per line, jsdoc-style.
      .map((line) => line.trim().replace(LEADING_STAR, ""))
      .join(" ")
      .trim();
    return text === "" ? undefined : text;
  }
  const lines = before.split("\n");
  const collected: string[] = [];
  for (let index = lines.length - 1; index >= 0; index--) {
    const trimmed = lines[index].trim();
    if (!trimmed.startsWith("//")) {
      break;
    }
    collected.unshift(trimmed.slice(2).trim());
  }
  const text = collected.join(" ").trim();
  return text === "" ? undefined : text;
}

/**
 * Whether the subtree references a name bound OUTSIDE it. Bare name nodes
 * only ever come from `let` bindings and lambda parameters, so a free one
 * means the enclosing call would have supplied it — evaluating standalone
 * would report a spurious `Unknown name` instead.
 *
 * Binders introduced *within* the subtree are fine, which is what keeps a
 * whole `map(xs, x => x * 2)` or `let(x, 1, x + 1)` evaluable while its inner
 * `x` alone is not.
 */
function hasFreeNames(node: FormulaNode, bound: ReadonlySet<string>): boolean {
  if (node.kind === "name") {
    return !bound.has(node.name);
  }
  if (node.kind === "lambda") {
    const inner = new Set(bound);
    for (const param of node.params) {
      inner.add(param.name);
    }
    return hasFreeNames(node.body, inner);
  }
  // `let(name, value, body)`: `value` sees the outer scope, `body` also sees
  // `name`. (`lets` desugars to nested `let` calls at parse time.)
  if (
    node.kind === "call" &&
    node.name.toLowerCase() === "let" &&
    node.args.length === 3 &&
    node.args[0].kind === "name"
  ) {
    const inner = new Set(bound);
    inner.add(node.args[0].name);
    return (
      hasFreeNames(node.args[1], bound) || hasFreeNames(node.args[2], inner)
    );
  }
  for (const child of formulaNodeChildren(node)) {
    if (hasFreeNames(child, bound)) {
      return true;
    }
  }
  return false;
}

/**
 * Whether a node can be evaluated on its own. A lambda is a value only its
 * caller can apply, and anything with free names needs bindings the enclosing
 * call supplies — in both cases showing the type alone beats showing a wrong
 * value or a spurious error.
 */
function isIndependentlyEvaluable(target: FormulaNode): boolean {
  if (target.kind === "lambda") {
    return false;
  }
  return !hasFreeNames(target, new Set());
}

/**
 * Resolve the hover at `offset`, or `null` when the source doesn't parse or
 * nothing sits under the cursor (trailing whitespace, an empty draft).
 */
export function formulaHoverAt(
  source: string,
  offset: number,
  options: FormulaHoverOptions
): FormulaHoverInfo | null {
  const parsed = parseFormula(source, options.context);
  if (!parsed.ok) {
    return null;
  }
  const node = innermostNodeAt(parsed.ast, offset);
  if (node === null) {
    return null;
  }
  const checked = checkFormula(parsed.ast, {
    ...options.context,
    traceTypes: true,
  });
  const typeSpan = checked.types.find(
    (candidate) =>
      candidate.start === node.position && candidate.end === node.end
  );
  const value =
    options.scope !== undefined && isIndependentlyEvaluable(node)
      ? formulaValueToDisplay(
          evaluateFormula(node, options.scope),
          options.rowLabel
        )
      : null;
  const entry =
    node.kind === "call" ? formulaFunctionForName(node.name) : undefined;
  // A catalog description beats a doc comment; otherwise take whatever the
  // author wrote above this line.
  const description =
    entry?.description ?? docCommentAbove(source, node.position);
  return {
    end: node.end,
    kind: hoverKindOf(node, entry !== undefined),
    label:
      entry === undefined
        ? labelFor(node, source, options.context)
        : formulaFunctionSignature(entry),
    start: node.position,
    type: typeSpan === undefined ? "unknown" : formulaTypeBadge(typeSpan.type),
    value,
    ...(description === undefined ? {} : { description }),
  };
}
