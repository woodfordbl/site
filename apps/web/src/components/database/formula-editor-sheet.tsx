/**
 * @fileoverview The mobile sheet layout for the formula panel: its column
 * arrangement, its Cancel/title/Done header (shared with the studio), its
 * standalone Rollup button, and the compact tappable status pill.
 *
 * Split out of `formula-editor-panel.tsx` to keep both files inside the
 * repository's length cap.
 */

import { IconSum } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { formulaStatusLine } from "@/components/database/formula-editor-status.tsx";
import { useHaptics } from "@/components/layout/haptics-provider.tsx";
import { Button } from "@/components/ui/button.tsx";
import type { FormulaCheckResult } from "@/lib/formula/check.ts";
import type { ParseFormulaResult } from "@/lib/formula/parse.ts";
import { formulaTypeBadge } from "@/lib/formula/type-badge.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Arranges the mobile sheet's slots in one column: explicit header (Cancel /
 * "Formula" / Done — the sheet's only save affordance), editor, tappable
 * status pill, preview, then the rollup tools (button or open wizard). The
 * bottom padding clears the keyboard-anchored accessory row, which floats
 * over the sheet at the keyboard top (or the viewport bottom while the
 * keyboard is closed).
 */
export function SheetLayout({
  editor,
  header,
  preview,
  status,
  tools,
  wizard,
}: {
  editor: ReactNode;
  header: ReactNode;
  preview: ReactNode;
  status: ReactNode;
  tools: ReactNode;
  /** The open rollup wizard; non-null, it replaces the tools slot. */
  wizard: ReactNode | null;
}): ReactNode {
  return (
    <div className="flex w-full flex-col gap-2 p-1 pb-16">
      {header}
      {editor}
      {status}
      {preview}
      {wizard ?? tools}
    </div>
  );
}

/**
 * The sheet's header row: Cancel backs out without saving, Done runs the
 * same save path (and the same parse-error gating) as the other layouts'
 * Save button. The title sits between them; a spacer keeps it centered when
 * the host passes no `onCancel`.
 */
export function SheetHeader({
  doneDisabled,
  onCancel,
  onDone,
  onDoneBlocked,
  title = "Formula",
}: {
  doneDisabled: boolean;
  onCancel: (() => void) | undefined;
  onDone: () => void;
  /**
   * Tapping Done while invalid: explain instead of a dead button. Optional —
   * the studio's always-visible status line already explains itself, so only
   * the sheet (whose pill collapses the message) needs the expansion hook.
   */
  onDoneBlocked?: () => void;
  title?: string;
}): ReactNode {
  const haptic = useHaptics();
  return (
    <div className="flex items-center justify-between gap-2">
      {onCancel === undefined ? (
        <span aria-hidden className="w-16" />
      ) : (
        <Button
          className="pointer-coarse:h-10"
          onClick={onCancel}
          variant="ghost"
        >
          Cancel
        </Button>
      )}
      <span className="min-w-0 truncate px-1 font-medium text-foreground text-sm">
        {title}
      </span>
      <Button
        aria-disabled={doneDisabled}
        className={cn("pointer-coarse:h-10", doneDisabled && "opacity-50")}
        onClick={() => {
          // Stay tappable while invalid: a silent dead button reads as a
          // broken sheet on touch. The boundary haptic plus the expanded
          // status pill say WHY Done won't fire.
          if (doneDisabled) {
            haptic("disabled");
            onDoneBlocked?.();
            return;
          }
          onDone();
        }}
      >
        Done
      </Button>
    </div>
  );
}

/**
 * The sheet's Rollup affordance: with no inline reference list to host the
 * button, a standalone one below the editor keeps the wizard reachable.
 * Renders nothing when no rollup is buildable (same gate as the other
 * layouts' Rollup button).
 */
export function SheetRollupButton({
  available,
  onOpen,
}: {
  available: boolean;
  onOpen: () => void;
}): ReactNode {
  if (!available) {
    return null;
  }
  return (
    <Button
      className="pointer-coarse:h-10 self-start"
      onClick={onOpen}
      variant="outline"
    >
      <IconSum />
      Rollup
    </Button>
  );
}

/**
 * Compact tappable status for the sheet, where the full status row would
 * crowd the editor: "✓ <type>" when the draft is clean, else "N issue(s)".
 * Tapping toggles the full first-diagnostic message (the same
 * {@link statusLine} content the other layouts show inline) beneath the
 * pill, so the message never eats vertical space until asked for.
 */
export function StatusPill({
  checked,
  displayPosition,
  expanded,
  onExpandedChange,
  parsed,
}: {
  checked: FormulaCheckResult | null;
  displayPosition: (offset: number) => number;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  parsed: ParseFormulaResult | null;
}): ReactNode {
  if (parsed === null) {
    return null;
  }
  const issueCount = parsed.ok ? (checked?.diagnostics.length ?? 0) : 1;
  const clean = issueCount === 0;
  return (
    <div className="flex flex-col gap-1 px-0.5">
      <button
        aria-expanded={expanded}
        className={cn(
          "min-h-6 pointer-coarse:min-h-9 self-start rounded-full border pointer-coarse:px-3 px-2.5 py-0.5 text-xs",
          clean
            ? "border-border text-muted-foreground"
            : "border-destructive/40 text-destructive"
        )}
        onClick={() => {
          onExpandedChange(!expanded);
        }}
        type="button"
      >
        {clean
          ? `✓ ${checked === null ? "Valid" : formulaTypeBadge(checked.resultType)}`
          : `${issueCount} issue${issueCount === 1 ? "" : "s"}`}
      </button>
      {expanded ? formulaStatusLine(parsed, checked, displayPosition) : null}
    </div>
  );
}
