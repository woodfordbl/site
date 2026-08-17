/**
 * @fileoverview The formula panel's status line: the first parse error, else
 * the first checker diagnostic, else "✓ Valid".
 *
 * Its own module because three layouts render it — the desktop status row,
 * the mobile sheet's expandable pill, and the studio — and importing it from
 * the panel would cycle back through the layouts the panel imports.
 */
import type { ReactNode } from "react";

import type { FormulaCheckResult } from "@/lib/formula/check.ts";
import type { ParseFormulaResult } from "@/lib/formula/parse.ts";

/**
 * Left half of the status row: the first parse error, else the first checker
 * diagnostic, else "✓ Valid". `null` for a blank draft. Positions are
 * 1-based indexes into what the user SEES — `displayPosition` maps each
 * canonical-draft offset past the `prop("<id>")` spans that render as short
 * labels (chips / humanized references).
 */
export function formulaStatusLine(
  parsed: ParseFormulaResult | null,
  checked: FormulaCheckResult | null,
  displayPosition: (offset: number) => number
): ReactNode {
  if (parsed === null) {
    return null;
  }
  if (!parsed.ok) {
    return (
      <span className="min-w-0 truncate text-destructive text-xs">
        {parsed.error.message} (at character{" "}
        {displayPosition(parsed.error.position) + 1})
      </span>
    );
  }
  const firstDiagnostic = checked?.diagnostics[0];
  if (firstDiagnostic !== undefined) {
    return (
      <span className="min-w-0 truncate text-destructive text-xs">
        {firstDiagnostic.message} (at character{" "}
        {displayPosition(firstDiagnostic.start) + 1})
      </span>
    );
  }
  return (
    <span className="min-w-0 truncate text-muted-foreground text-xs">
      ✓ Valid
    </span>
  );
}
