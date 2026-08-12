import type { FormulaCheckContext } from "@/lib/formula/check.ts";
import type { FormulaValueDisplayOptions } from "@/lib/formula/display.ts";
import { formulaValueToDisplay } from "@/lib/formula/display.ts";
import { evaluateFormula } from "@/lib/formula/evaluate.ts";
import { parseFormula } from "@/lib/formula/parse.ts";
import { formulaStaticReferences } from "@/lib/formula/references.ts";
import type { FormulaScope } from "@/lib/formula/values.ts";
import { formulaError } from "@/lib/formula/values.ts";
import type { InlineMark } from "@/lib/schemas/rich-text.ts";

/**
 * The whole computation behind an inline prose token, kept pure so the React
 * layer is a thin subscription wrapper (`docs/proposals/inline-prose-tokens.md`).
 *
 * Given a block's formula marks, it answers the two questions the renderer has:
 * **what does each token display**, and **which databases must change before
 * any of that is stale**. Never throws — a token that fails to parse or
 * evaluate displays its error, so one bad token cannot take down a paragraph.
 */

export interface InlineTokenEvaluation {
  /**
   * Databases any token reads, so the caller can subscribe to exactly those
   * rather than everything. Empty when no token reaches outside the page.
   */
  readonly databaseIds: ReadonlySet<string>;
  /** Display string per token, keyed by the mark's `start` offset. */
  readonly values: ReadonlyMap<number, string>;
  /** True when any token reads the clock, so the caller joins the 60s tick. */
  readonly volatile: boolean;
}

const EMPTY: InlineTokenEvaluation = {
  databaseIds: new Set(),
  values: new Map(),
  volatile: false,
};

/** Formula marks in offset order; non-formula marks and blank ones dropped. */
function tokenMarks(marks: readonly InlineMark[]): InlineMark[] {
  return marks
    .filter(
      (mark) =>
        mark.type === "formula" &&
        mark.expression !== undefined &&
        mark.expression.trim() !== ""
    )
    .sort((a, b) => a.start - b.start);
}

/**
 * Evaluate every token in `marks` against `scope`, and collect the databases
 * they read.
 *
 * `context` types the expressions (base page fields, plus the workspace
 * databases for `db("…")`); `scope` supplies the values. They must describe the
 * same world — the checker's reference extraction is what makes the returned
 * `databaseIds` trustworthy.
 *
 * `display` carries the value→string conventions the grid already uses, so a
 * token reads the way the same formula reads in a table cell: numbers grouped,
 * dates formatted, relations shown by their row's title rather than a
 * placeholder.
 */
export function evaluateInlineTokens(
  marks: readonly InlineMark[],
  scope: FormulaScope,
  context: FormulaCheckContext,
  display?: FormulaValueDisplayOptions
): InlineTokenEvaluation {
  const tokens = tokenMarks(marks);
  if (tokens.length === 0) {
    return EMPTY;
  }
  const databaseIds = new Set<string>();
  const values = new Map<number, string>();
  let volatile = false;

  for (const token of tokens) {
    const source = token.expression ?? "";
    const parsed = parseFormula(source);
    if (!parsed.ok) {
      // A parse error is the token's value — visible, and scoped to itself.
      values.set(
        token.start,
        formulaValueToDisplay(formulaError(parsed.error.message))
      );
      continue;
    }
    const references = formulaStaticReferences(parsed.ast, context);
    for (const reference of references.databaseRefs) {
      databaseIds.add(reference.targetDatabaseId);
    }
    for (const traversal of references.traversals) {
      databaseIds.add(traversal.targetDatabaseId);
      if (traversal.sourceDatabaseId !== null) {
        databaseIds.add(traversal.sourceDatabaseId);
      }
    }
    volatile = volatile || references.volatile;
    values.set(
      token.start,
      formulaValueToDisplay(evaluateFormula(parsed.ast, scope), display)
    );
  }

  return { databaseIds, values, volatile };
}
