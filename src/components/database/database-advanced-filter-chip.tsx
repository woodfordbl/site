import { IconMathFunction, IconPlus, IconX } from "@tabler/icons-react";
import {
  lazy,
  type ReactNode,
  // biome-ignore lint/correctness/noUnresolvedImports: React 19 exports Suspense; Biome types lag
  Suspense,
  useMemo,
  useRef,
  useState,
} from "react";

import { FormulaCodeEditorBoundary } from "@/components/database/formula-editor-panel.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Chip, ChipButton, ChipSegment } from "@/components/ui/chip.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import {
  type FormulaRelatedDatabase,
  formulaCheckContext,
} from "@/lib/databases/formula-values.ts";
import {
  checkFormula,
  type FormulaCheckContext,
  type FormulaCheckResult,
  formulaTypeBadge,
  formulaTypeFits,
} from "@/lib/formula/check.ts";
import { type ParseFormulaResult, parseFormula } from "@/lib/formula/parse.ts";
import {
  canonicalizeExpression,
  humanizeExpression,
} from "@/lib/formula/ref-rewrite.ts";
import { BOOLEAN_TYPE } from "@/lib/formula/types.ts";
import type { FormulaPreparedUserFunctions } from "@/lib/formula/values.ts";
import type { DatabaseField, DatabaseView } from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * The filter bar's ADVANCED filter chip (proposal §8: "advanced filter = any
 * boolean formula"): one per view, carrying `view.advancedFilter` — an
 * arbitrary formula evaluated per row by `applyAdvancedFilter`
 * (`lib/databases/advanced-row-filter.ts`; rows pass only on exactly `true`).
 *
 * Presentation follows the filter bar's chip conventions: a dashed
 * "+ Advanced" add trigger while unset (shown under the same `showAddTrigger`
 * gate as "+ Filter"), a solid `[ƒ Advanced] [expression] [×]` chip while
 * set. The expression segment opens the mini formula editor in a popover
 * (a vaul bottom drawer on coarse pointers, courtesy of the ui Popover) —
 * the LAZY CodeMirror editor on fine pointers with the humanized plain
 * textarea as fallback/coarse surface, a parse/type status line, and
 * Apply/Clear actions. Writes go through `updateDatabaseView` via the
 * host-supplied `onApply`.
 *
 * BROKEN states get destructive chip styling with a `title` naming the
 * issue, distinguished by consequence:
 * - Unparseable saved text → the filter is IGNORED (every row visible) —
 *   the title says so.
 * - Parses but fails the checker (e.g. a referenced field was deleted) →
 *   evaluation errors per row, and errored rows are HIDDEN (fail closed) —
 *   the title names the diagnostic.
 *
 * A blank saved expression (`{ expression: "" }`) is the "just added from
 * the mobile funnel" state: inert as a filter, the editor auto-opens, and
 * dismissing without applying clears the filter so no dead chip lingers.
 */

/** Same lazy CM6 chunk the formula panel loads (code-split; see panel docs). */
const FormulaCodeEditor = lazy(() =>
  import("@/components/database/formula-code-editor.tsx").then((module) => ({
    default: module.FormulaCodeEditor,
  }))
);

/**
 * The stored expression's problem, if any, for the chip's broken state:
 * `ignored` (unparseable — the filter is skipped entirely) or `hides`
 * (checker diagnostic — rows evaluating to errors are hidden). `null` for
 * healthy and blank expressions.
 */
function advancedFilterIssue(
  expression: string,
  checkContext: FormulaCheckContext
): string | null {
  if (expression.trim() === "") {
    return null;
  }
  const parsed = parseFormula(expression);
  if (!parsed.ok) {
    return `Advanced filter is ignored — ${parsed.error.message}`;
  }
  const diagnostic = checkFormula(parsed.ast, checkContext).diagnostics[0];
  if (diagnostic === undefined) {
    return null;
  }
  return `Advanced filter is broken — ${diagnostic.message}`;
}

/**
 * The editor's one-line status: the parse error, else the first checker
 * diagnostic (both destructive), else a muted non-boolean warning when the
 * checked type can't be `true` (`formulaTypeFits` against {@link
 * BOOLEAN_TYPE}), else "✓ <type>". Blank drafts show the pass-rule hint.
 */
function editorStatusLine(
  parsed: ParseFormulaResult | null,
  checked: FormulaCheckResult | null
): ReactNode {
  if (parsed === null) {
    return (
      <span className="text-muted-foreground text-xs">
        Rows stay visible only when the formula returns true.
      </span>
    );
  }
  if (!parsed.ok) {
    return (
      <span className="text-destructive text-xs">{parsed.error.message}</span>
    );
  }
  const diagnostic = checked?.diagnostics[0];
  if (diagnostic !== undefined) {
    return (
      <span className="text-destructive text-xs">{diagnostic.message}</span>
    );
  }
  if (checked !== null && !formulaTypeFits(checked.resultType, BOOLEAN_TYPE)) {
    return (
      <span className="text-muted-foreground text-xs">
        Returns {formulaTypeBadge(checked.resultType)} — only rows where it is
        exactly true stay visible.
      </span>
    );
  }
  return (
    <span className="text-muted-foreground text-xs">
      ✓ {checked === null ? "Valid" : formulaTypeBadge(checked.resultType)}
    </span>
  );
}

interface AdvancedFilterEditorProps {
  /** Stored (canonical) expression the draft starts from. */
  expression: string;
  fields: readonly DatabaseField[];
  /** Apply: persist the canonical draft ("" clears) and close. */
  onApply: (expression: string) => void;
  /** Clear: remove the advanced filter and close. */
  onClear: () => void;
  relatedDatabases: readonly FormulaRelatedDatabase[];
  userFunctions: FormulaPreparedUserFunctions;
}

/**
 * The popover body: the mini formula editor (lazy CM6 on fine pointers,
 * humanized textarea on coarse and as the Suspense/error fallback), the
 * status line, and Apply/Clear. Mounted fresh per open, so the draft always
 * starts from the stored expression. Apply is gated exactly like the panel's
 * Save — parse errors and checker diagnostics block; blank stays applyable
 * (it clears the filter).
 */
function AdvancedFilterEditor({
  expression,
  fields,
  onApply,
  onClear,
  relatedDatabases,
  userFunctions,
}: AdvancedFilterEditorProps): ReactNode {
  const [draft, setDraft] = useState(expression);
  const coarsePointer = useIsCoarsePrimaryPointer();

  const checkContext = useMemo(
    () => formulaCheckContext(fields, relatedDatabases, userFunctions),
    [fields, relatedDatabases, userFunctions]
  );

  const trimmed = draft.trim();
  const parsed = trimmed === "" ? null : parseFormula(draft);
  const checked: FormulaCheckResult | null = useMemo(
    () => (parsed?.ok ? checkFormula(parsed.ast, checkContext) : null),
    [parsed, checkContext]
  );

  const applyDisabled =
    parsed !== null && (!parsed.ok || (checked?.diagnostics.length ?? 0) > 0);
  const apply = () => {
    if (applyDisabled) {
      return;
    }
    onApply(canonicalizeExpression(draft, fields, relatedDatabases).text);
  };

  // The coarse-pointer surface and the CM6 fallback: displays the humanized
  // draft, re-canonicalizes every change (the same display-stable round trip
  // the formula panel's textarea relies on).
  const expressionTextarea = (
    <Textarea
      aria-label="Advanced filter formula"
      autoComplete="off"
      className="max-h-32 min-h-16 font-mono text-xs md:text-xs"
      onChange={(event) => {
        setDraft(
          canonicalizeExpression(event.target.value, fields, relatedDatabases)
            .text
        );
      }}
      placeholder='thisPage.Status == "Active"'
      spellCheck={false}
      value={humanizeExpression(draft, fields, relatedDatabases)}
    />
  );

  return (
    <div className="flex w-full flex-col gap-1.5">
      <span className="px-0.5 font-medium text-muted-foreground text-xs">
        Advanced filter
      </span>
      {coarsePointer ? (
        expressionTextarea
      ) : (
        <FormulaCodeEditorBoundary fallback={expressionTextarea}>
          <Suspense fallback={expressionTextarea}>
            <FormulaCodeEditor
              ariaLabel="Advanced filter formula"
              autoFocus
              checkContext={checkContext}
              databases={relatedDatabases}
              fields={fields}
              onChange={setDraft}
              onSubmit={apply}
              placeholder='thisPage.Status == "Active"'
              value={draft}
            />
          </Suspense>
        </FormulaCodeEditorBoundary>
      )}
      <div className="px-0.5">{editorStatusLine(parsed, checked)}</div>
      <div className="flex items-center justify-end gap-1.5">
        {expression.trim() === "" ? null : (
          <Button onClick={onClear} size="xs" variant="ghost">
            Clear
          </Button>
        )}
        <Button disabled={applyDisabled} onClick={apply} size="xs">
          Apply
        </Button>
      </div>
    </div>
  );
}

export interface DatabaseAdvancedFilterChipProps {
  fields: readonly DatabaseField[];
  /**
   * Persist a change: a canonical expression sets/replaces the advanced
   * filter, `undefined` clears it (the host writes through
   * `updateDatabaseView`).
   */
  onAdvancedFilterChange: (expression: string | undefined) => void;
  /** Every workspace database, for member typing and db-reference labels. */
  relatedDatabases: readonly FormulaRelatedDatabase[];
  /** Show the dashed "+ Advanced" trigger while unset (mirrors "+ Filter"). */
  showAddTrigger: boolean;
  /** Named user-defined functions (prepared registry). */
  userFunctions: FormulaPreparedUserFunctions;
  view: DatabaseView;
}

/** The advanced-filter chip (see module docs). */
export function DatabaseAdvancedFilterChip({
  fields,
  onAdvancedFilterChange,
  relatedDatabases,
  showAddTrigger,
  userFunctions,
  view,
}: DatabaseAdvancedFilterChipProps): ReactNode {
  const advancedFilter = view.advancedFilter;
  const expression = advancedFilter?.expression ?? "";
  // A blank stored expression is the just-added state (mobile funnel):
  // auto-open the editor so the tap lands directly in it.
  const [open, setOpen] = useState(
    () => advancedFilter !== undefined && expression.trim() === ""
  );
  // Set by Apply/Clear right before closing, so the close handler can tell
  // an acted-on close from a dismissal (which cleans up a still-blank chip).
  const actedRef = useRef(false);

  const checkContext = useMemo(
    () => formulaCheckContext(fields, relatedDatabases, userFunctions),
    [fields, relatedDatabases, userFunctions]
  );
  const issue = useMemo(
    () => advancedFilterIssue(expression, checkContext),
    [expression, checkContext]
  );

  if (advancedFilter === undefined && !showAddTrigger) {
    return null;
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next || actedRef.current) {
      actedRef.current = false;
      return;
    }
    // Dismissed without applying while the stored expression is still blank:
    // drop the placeholder filter so no inert chip lingers.
    if (advancedFilter !== undefined && expression.trim() === "") {
      onAdvancedFilterChange(undefined);
    }
  };

  const editor = (
    <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)] p-2">
      <AdvancedFilterEditor
        expression={expression}
        fields={fields}
        onApply={(next) => {
          actedRef.current = true;
          onAdvancedFilterChange(next.trim() === "" ? undefined : next);
          setOpen(false);
        }}
        onClear={() => {
          actedRef.current = true;
          onAdvancedFilterChange(undefined);
          setOpen(false);
        }}
        relatedDatabases={relatedDatabases}
        userFunctions={userFunctions}
      />
    </PopoverContent>
  );

  if (advancedFilter === undefined) {
    // Unset: the dashed add trigger IS the popover trigger — nothing is
    // written until Apply.
    return (
      <Popover onOpenChange={handleOpenChange} open={open}>
        <PopoverTrigger
          render={
            <Chip render={<button type="button" />} variant="dashed">
              <IconPlus className="size-3.5 stroke-[1.5px]" />
              Advanced
            </Chip>
          }
        />
        {editor}
      </Popover>
    );
  }

  const summary = humanizeExpression(expression, fields, relatedDatabases);
  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <Chip
        className={cn(
          issue !== null && "border-destructive/40 text-destructive"
        )}
        title={issue ?? undefined}
      >
        <ChipSegment className={cn(issue !== null && "text-destructive")}>
          <IconMathFunction className="size-3.5 shrink-0 stroke-[1.5px]" />
          Advanced
        </ChipSegment>
        <PopoverTrigger
          render={
            <ChipButton
              className={cn(
                issue !== null &&
                  "text-destructive hover:text-destructive focus-visible:text-destructive"
              )}
            >
              {summary.trim() === "" ? (
                <span className="text-muted-foreground/70">Formula</span>
              ) : (
                <span
                  className={cn(
                    "max-w-48 truncate font-mono",
                    issue === null ? "text-foreground" : "text-destructive"
                  )}
                >
                  {summary}
                </span>
              )}
            </ChipButton>
          }
        />
        <ChipButton
          aria-label="Remove advanced filter"
          className="px-1"
          onClick={() => {
            onAdvancedFilterChange(undefined);
          }}
        >
          <IconX className="size-3.5 stroke-[1.5px]" />
        </ChipButton>
      </Chip>
      {editor}
    </Popover>
  );
}
