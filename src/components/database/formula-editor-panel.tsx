import { IconMathFunction, IconSearch, IconSum } from "@tabler/icons-react";
import {
  Component,
  type KeyboardEvent,
  lazy,
  type ReactNode,
  type RefObject,
  // biome-ignore lint/correctness/noUnresolvedImports: React 19 exports Suspense; Biome types lag
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { resolveFieldIcon } from "@/components/database/database-field-icons.ts";
import { FormulaChipMenu } from "@/components/database/formula-chip-menu.tsx";
import type {
  FormulaChipTap,
  FormulaCodeEditorHandle,
} from "@/components/database/formula-code-editor.tsx";
import { FormulaEditorAccessoryRow } from "@/components/database/formula-editor-accessory-row.tsx";
import {
  FormulaRollupWizard,
  formulaRollupRelationFields,
} from "@/components/database/formula-rollup-wizard.tsx";
import { Button } from "@/components/ui/button.tsx";
import { TokenChip } from "@/components/ui/chip.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import {
  computeFormulaRowValues,
  type FormulaRelatedDatabase,
  formulaCheckContext,
} from "@/lib/databases/formula-values.ts";
import {
  FORMULA_FUNCTION_CATALOG,
  FORMULA_OPERATOR_CATALOG,
  type FormulaFunctionEntry,
  type FormulaOperatorCatalogEntry,
  formulaFunctionSignature,
  formulaParamLabel,
  formulaPropertyReference,
} from "@/lib/formula/catalog.ts";
import {
  checkFormula,
  type FormulaCheckResult,
  formulaTypeBadge,
} from "@/lib/formula/check.ts";
import { formulaValueToDisplay } from "@/lib/formula/display.ts";
import { evaluateFormula } from "@/lib/formula/evaluate.ts";
import {
  formulaDbIdSpans,
  formulaPropIdSpans,
} from "@/lib/formula/highlight.ts";
import { type ParseFormulaResult, parseFormula } from "@/lib/formula/parse.ts";
import {
  canonicalDatabaseReference,
  canonicalizeExpression,
  canonicalPropertyReference,
  type FormulaRefDatabase,
  humanizeExpression,
} from "@/lib/formula/ref-rewrite.ts";
import {
  createFormulaRowScope,
  formulaRowLabelOf,
} from "@/lib/formula/row-scope.ts";
import type { FormulaRelationResolver } from "@/lib/formula/values.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Shared formula BUILDER panel (Notion-style): expression textarea with live
 * parse/check status (first checker diagnostic, or "✓ Valid" plus the
 * result-type badge) and a live preview against a pickable row (first row by
 * default; a compact row selector appears when the caller supplies more —
 * see `previewRows`) on top, then a searchable reference of Properties /
 * Functions / Operators that insert at the caret, with a fixed-height detail
 * strip documenting the focused entry. Three arrangements via `layout`: the
 * default single-column stack (menu popup), the two-column `wide` form for
 * the desktop formula dialog (see {@link PanelLayout}), and the mobile
 * `sheet` form (see {@link SheetLayout}) — Cancel/Formula/Done header, the
 * CM6 editor even on coarse pointers, a tappable {@link StatusPill}, and the
 * keyboard-anchored {@link FormulaEditorAccessoryRow} with its property /
 * function picker drawers standing in for the inline reference list.
 *
 * The `draft` state is the CANONICAL expression (`prop("<id>")` — exactly
 * what gets stored), so parse/check/preview/save all operate on it directly.
 * The CM6 editor edits the canonical text natively and renders property
 * spans as schema-labeled chips; the plain textarea (coarse pointers, and
 * the Suspense/error fallback on fine ones) displays
 * `humanizeExpression(draft)` and re-canonicalizes on every change —
 * humanize∘canonicalize is display-stable, so users still only ever see
 * names there. Save/Done require a VALID formula — blocked by parse errors
 * AND by checker diagnostics, so broken drafts never persist — while
 * blank/whitespace drafts stay saveable (clearing a formula is legit). Save
 * runs one final `canonicalizeExpression` (idempotent; catches any typed
 * name refs the editor hasn't converted yet) and hands the canonical text to
 * the caller's `onSave` unconditionally (so the menu can close); the caller
 * compares against the stored expression and skips the write for unchanged
 * drafts.
 *
 * On fine pointers — and on coarse ones in the `sheet` layout, where CM6's
 * native touch caret/IME handling is the point — the expression input is the
 * lazy-loaded CodeMirror 6 editor (formula-code-editor.tsx): chips, syntax
 * highlighting, diagnostic squiggles (fed the panel's memoized check context
 * via `checkContext`), the argument info card, soft wrap, Mod+Enter saves —
 * with the plain textarea as the Suspense fallback while the CM6 chunk
 * loads. Tapping a chip in the CM6 surface opens the chip option menu
 * (formula-chip-menu.tsx, anchored at the chip; a bottom drawer on coarse
 * pointers): Change property swaps the reference in place and Remove deletes
 * the whole canonical span, both applied through the editor handle's
 * `replaceRange` against the span the tap reported. Coarse pointers outside
 * the sheet keep the textarea entirely (the
 * cramped in-menu stack has no room for chip affordances). Caret insertion from the
 * reference list goes through the editor's imperative handle when mounted
 * (properties insert the canonical `prop("<id>")` text, which renders as a
 * chip with the caret placed after it), else through the textarea's
 * selection range (properties insert the display `thisPage.Name` form).
 */

/**
 * Warms lazily so ~85 KB gz of CM6 stays out of the main bundle and is paid
 * only when a formula editor actually opens (same code-split pattern as
 * `preload-page-icon-picker.ts`).
 */
const FormulaCodeEditor = lazy(() =>
  import("@/components/database/formula-code-editor.tsx").then((module) => ({
    default: module.FormulaCodeEditor,
  }))
);

/**
 * Degrades a failed code-editor mount to the plain textarea instead of
 * letting the error escape to the route CatchBoundary (which blanks the
 * whole page). The realistic trigger is a chunk-fetch failure — a stale
 * client requesting a rotated-out hash after a deploy, or offline.
 */
// biome-ignore lint/style/useReactFunctionComponents: error boundaries require a class — React has no hook equivalent
export class FormulaCodeEditorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Keep typing inside menu-embedded inputs from triggering the menu's
 * typeahead/arrow navigation; Escape still propagates so it closes the menu.
 */
function stopMenuKeys(
  event: KeyboardEvent<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >
): void {
  if (event.key !== "Escape") {
    event.stopPropagation();
  }
}

/** The panel state one {@link spliceGeneratedExpression} call works against. */
interface SpliceGeneratedTarget {
  codeEditorRef: RefObject<FormulaCodeEditorHandle | null>;
  databases: readonly FormulaRefDatabase[] | undefined;
  draft: string;
  fields: readonly DatabaseField[];
  insertAtCaret: (text: string, caretOffset: number) => void;
  setDraft: (draft: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

/**
 * Land a rollup-wizard-generated CANONICAL expression in the active editing
 * surface, per surface like property references: the CM6 editor takes the
 * canonical text directly (its relation ref chips immediately), the textarea
 * takes the humanized display form through the same caret splice. An
 * empty/whitespace draft is REPLACED outright (the generated formula is
 * complete on its own), caret at the end; otherwise the text splices at the
 * caret. Module-level (not a closure) purely to keep the panel component
 * under the complexity cap.
 */
function spliceGeneratedExpression(
  generated: string,
  target: SpliceGeneratedTarget
): void {
  const { codeEditorRef, databases, draft, fields, textareaRef } = target;
  const blank = draft.trim() === "";
  const editor = codeEditorRef.current;
  if (editor !== null) {
    if (blank && draft !== "") {
      // Whitespace-only doc: replace via the controlled value (the sync
      // effect swaps the CM6 doc), then refocus.
      target.setDraft(generated);
      requestAnimationFrame(() => {
        codeEditorRef.current?.focus();
      });
      return;
    }
    // On an empty doc a caret splice IS a replace, caret landing at the end.
    editor.insertText(generated, generated.length);
    return;
  }
  const display = humanizeExpression(generated, fields, databases);
  if (!blank) {
    target.insertAtCaret(display, display.length);
    return;
  }
  target.setDraft(display);
  requestAnimationFrame(() => {
    const element = textareaRef.current;
    if (element) {
      element.focus();
      element.setSelectionRange(display.length, display.length);
    }
  });
}

/** Docs shown in the detail strip for the focused/last-inserted entry. */
interface ReferenceDetail {
  description: string;
  example?: string;
  title: string;
}

interface ReferenceRowProps {
  children: ReactNode;
  detail: ReferenceDetail;
  onInsert: () => void;
  onShowDetail: (detail: ReferenceDetail) => void;
}

/**
 * One tappable reference row: tap inserts (and shows its docs in the detail
 * strip); hover/focus previews the docs without inserting. ≥40px tall on
 * coarse pointers for touch.
 */
function ReferenceRow({
  children,
  detail,
  onInsert,
  onShowDetail,
}: ReferenceRowProps) {
  const coarse = useIsCoarsePrimaryPointer();
  return (
    <button
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
        coarse ? "min-h-10" : "min-h-7"
      )}
      onClick={() => {
        onShowDetail(detail);
        onInsert();
      }}
      onFocus={() => {
        onShowDetail(detail);
      }}
      onPointerEnter={() => {
        onShowDetail(detail);
      }}
      type="button"
    >
      {children}
    </button>
  );
}

/**
 * Canonical-offset → display-offset mapping over BOTH reference-span kinds.
 * `formulaDisplayOffset` (highlight.ts) walks `prop("<id>")` spans only, so
 * the panel merges the prop and db span lists (both located by the same
 * token-level scan the chips use) and applies the identical arithmetic:
 * every span before the offset shifts it by (rendered label − canonical
 * text) and an offset inside a span clamps to the span's rendered extent.
 */
function referenceDisplayOffset(
  source: string,
  offset: number,
  propLabelLength: (id: string) => number,
  dbLabelLength: (id: string) => number
): number {
  const spans = [
    ...formulaPropIdSpans(source).map((span) => ({
      ...span,
      label: propLabelLength(span.id),
    })),
    ...formulaDbIdSpans(source).map((span) => ({
      ...span,
      label: dbLabelLength(span.id),
    })),
  ].sort((a, b) => a.start - b.start);
  let delta = 0;
  for (const span of spans) {
    if (span.end <= offset) {
      delta += span.label - (span.end - span.start);
      continue;
    }
    if (span.start < offset) {
      return span.start + delta + Math.min(offset - span.start, span.label);
    }
    break;
  }
  return offset + delta;
}

/**
 * Left half of the status row: the first parse error, else the first checker
 * diagnostic, else "✓ Valid". `null` for a blank draft. Positions are
 * 1-based indexes into what the user SEES — `displayPosition` maps each
 * canonical-draft offset past the `prop("<id>")` spans that render as short
 * labels (chips / humanized references).
 */
function statusLine(
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

/**
 * The stack/wide status row: {@link statusLine} on the left, the checked
 * result-type badge on the right. Renders nothing for a blank draft —
 * owning that guard here keeps the panel under the complexity cap.
 */
function StatusRow({
  checked,
  displayPosition,
  parsed,
}: {
  checked: FormulaCheckResult | null;
  displayPosition: (offset: number) => number;
  parsed: ParseFormulaResult | null;
}): ReactNode {
  if (parsed === null) {
    return null;
  }
  return (
    <div className="flex items-center justify-between gap-2 px-0.5">
      {statusLine(parsed, checked, displayPosition)}
      {checked === null ? null : (
        <span className="flex shrink-0 items-center gap-1 text-muted-foreground text-xs">
          Type:
          <TokenChip tone="neutral">
            {formulaTypeBadge(checked.resultType)}
          </TokenChip>
        </span>
      )}
    </div>
  );
}

/** Muted section heading inside the reference list. */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-1.5 pt-2 pb-1 font-medium text-muted-foreground text-xs first:pt-1">
      {children}
    </div>
  );
}

/** One row offered to the preview picker. */
export interface FormulaPreviewRow {
  id: string;
  /** Compact display label: the row's primary-field text, or "Row N". */
  label: string;
  values: Record<string, DatabaseCellValue>;
}

/**
 * The live-preview line: the evaluated result plus, when more than one row
 * is on offer, a compact native select to pick which row it evaluates
 * against (one muted control, no popup chrome). Renders nothing without a
 * parseable draft (`preview` null) or a row to evaluate against — owning
 * that guard here keeps the panel under the complexity cap.
 */
function FormulaPreviewLine({
  onPickRow,
  pickedRow,
  preview,
  rows,
}: {
  onPickRow: (rowId: string) => void;
  pickedRow: FormulaPreviewRow | null;
  preview: string | null;
  rows: readonly FormulaPreviewRow[];
}) {
  if (preview === null || pickedRow === null) {
    return null;
  }
  return (
    <div className="flex items-center gap-2 px-0.5">
      <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
        Preview: {preview === "" ? "(empty)" : preview}
      </span>
      {rows.length > 1 ? (
        <select
          aria-label="Preview row"
          className="h-5 max-w-32 shrink-0 rounded-md border border-border bg-transparent px-1 text-muted-foreground text-xs outline-none transition-colors hover:text-foreground focus-visible:border-ring"
          onChange={(event) => {
            onPickRow(event.target.value);
          }}
          onKeyDown={stopMenuKeys}
          value={pickedRow.id}
        >
          {rows.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

export interface FormulaEditorPanelProps {
  /** Stored (canonical) expression the draft starts from. */
  expression: string;
  /**
   * Full database schema: non-formula fields become the Properties section,
   * and the whole list feeds the preview scope.
   */
  fields: readonly DatabaseField[];
  /**
   * Arrangement: `stack` (default) is the narrow single-column form for the
   * column-menu popup/drawer; `wide` is the two-column dialog form — editor,
   * status, preview, and Save on the left; the reference browser and detail
   * strip on the right, with a taller editor and reference list. The host
   * dialog owns the heading, so `wide` drops the panel's own "Formula" label.
   * `sheet` is the mobile form for the coarse-pointer submenu drawer:
   * Cancel/Formula/Done header (Done replaces Save), the CM6 editor even on
   * coarse pointers, a tappable status pill, and the keyboard-anchored
   * accessory row + picker drawers instead of the inline reference list.
   */
  layout?: "sheet" | "stack" | "wide";
  /**
   * Sheet header's Cancel — backs out without saving (typically closes the
   * host drawer). Only rendered in the `sheet` layout.
   */
  onCancel?: () => void;
  /** Called with the CANONICAL text on Save (even when unchanged — the caller decides). */
  onSave: (expression: string) => void;
  /**
   * Rows the live preview can evaluate against (callers cap at ~20, manual
   * order). The first row is the default; more than one row adds the picker.
   * Empty when the table is empty — no preview renders.
   */
  previewRows: readonly FormulaPreviewRow[];
  /**
   * Every database (own included) for the checker's member-access typing —
   * `r.Estimate` resolves against the relation target's schema — and for
   * `db("…")` reference name↔id rewriting everywhere the panel translates
   * (textarea display, save, status positions, the CM6 editor's db chips
   * and completions, the chip menu's Change-database list). Omitted,
   * relation members check optimistically (no diagnostics, unknown type)
   * and db references pass through untranslated.
   */
  relatedDatabases?: readonly FormulaRelatedDatabase[];
  /**
   * Cross-database reader for the live preview, so relation rollups in the
   * draft evaluate against real target rows. Omitted, relation cells
   * preview as blank.
   */
  relations?: FormulaRelationResolver;
}

interface ReferenceListEntries {
  functionEntries: (FormulaFunctionEntry & { signature: string })[];
  operatorEntries: FormulaOperatorCatalogEntry[];
  propertyFields: DatabaseField[];
}

/** The searchable Properties / Functions / Operators reference list. */
function ReferenceList({
  className,
  entries,
  onInsertAtCaret,
  onInsertFunction,
  onInsertProperty,
  onShowDetail,
}: {
  /** Height override for the wide (dialog) layout. */
  className?: string;
  entries: ReferenceListEntries;
  onInsertAtCaret: (text: string, caretOffset: number) => void;
  onInsertFunction: (entry: FormulaFunctionEntry) => void;
  onInsertProperty: (propertyField: DatabaseField) => void;
  onShowDetail: (detail: ReferenceDetail) => void;
}): ReactNode {
  const { functionEntries, operatorEntries, propertyFields } = entries;
  const nothingMatches =
    propertyFields.length === 0 &&
    functionEntries.length === 0 &&
    operatorEntries.length === 0;
  return (
    <ScrollArea
      className={cn(
        "max-h-52 overflow-hidden rounded-md border border-border",
        className
      )}
    >
      <div className="flex flex-col p-1">
        {propertyFields.length > 0 ? (
          <SectionLabel>Properties</SectionLabel>
        ) : null}
        {propertyFields.map((propertyField) => {
          const FieldIcon = resolveFieldIcon(propertyField);
          const reference = formulaPropertyReference(propertyField.name);
          return (
            <ReferenceRow
              detail={{
                title: reference,
                description: `Inserts this row's ${propertyField.name} value.`,
                example: reference,
              }}
              key={propertyField.id}
              onInsert={() => {
                onInsertProperty(propertyField);
              }}
              onShowDetail={onShowDetail}
            >
              <FieldIcon className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground" />
              <span className="truncate">{propertyField.name}</span>
            </ReferenceRow>
          );
        })}
        {functionEntries.length > 0 ? (
          <SectionLabel>Functions</SectionLabel>
        ) : null}
        {functionEntries.map((entry) => (
          <ReferenceRow
            detail={{
              title: entry.signature,
              description: entry.description,
              example: entry.examples[0],
            }}
            key={entry.name}
            onInsert={() => {
              onInsertFunction(entry);
            }}
            onShowDetail={onShowDetail}
          >
            <IconMathFunction className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground" />
            <span className="shrink-0 font-mono text-xs">{entry.name}</span>
            <span className="truncate text-muted-foreground text-xs">
              {entry.signature.slice(entry.name.length)}
            </span>
          </ReferenceRow>
        ))}
        {operatorEntries.length > 0 ? (
          <SectionLabel>Operators</SectionLabel>
        ) : null}
        {operatorEntries.map((entry) => (
          <ReferenceRow
            detail={{
              title: entry.symbol,
              description: entry.description,
            }}
            key={entry.symbol}
            onInsert={() => {
              onInsertAtCaret(` ${entry.symbol} `, entry.symbol.length + 2);
            }}
            onShowDetail={onShowDetail}
          >
            <span className="w-8 shrink-0 text-center font-mono text-xs">
              {entry.symbol}
            </span>
            <span className="truncate text-muted-foreground text-xs">
              {entry.description}
            </span>
          </ReferenceRow>
        ))}
        {nothingMatches ? (
          <div className="px-1.5 py-3 text-center text-muted-foreground text-xs">
            No matches
          </div>
        ) : null}
      </div>
    </ScrollArea>
  );
}

/** The fixed-height docs strip fed by hover/focus on reference rows. */
function DetailStrip({
  detail,
}: {
  detail: ReferenceDetail | null;
}): ReactNode {
  return (
    <div className="flex h-20 flex-col gap-0.5 overflow-hidden rounded-md border border-border px-2 py-1.5">
      {detail === null ? (
        <span className="text-muted-foreground text-xs">
          Select an item to see how it works.
        </span>
      ) : (
        <>
          <span className="truncate font-mono text-foreground text-xs">
            {detail.title}
          </span>
          <span className="line-clamp-2 text-muted-foreground text-xs">
            {detail.description}
          </span>
          {detail.example ? (
            <span className="truncate font-mono text-muted-foreground text-xs">
              {detail.example}
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}

interface PanelLayoutProps {
  detail: ReactNode;
  /** In the wide form Save lives INSIDE this slot (the editor's InputGroup). */
  editor: ReactNode;
  preview: ReactNode;
  /** The search + reference list, or the rollup wizard while it's open. */
  reference: ReactNode;
  /** Standalone Save for the stack form; unused in wide (see `editor`). */
  save: ReactNode;
  status: ReactNode;
  wide: boolean;
}

/**
 * Arranges the panel's slots per layout: the narrow menu form stacks
 * everything in one column; the wide dialog form fixes the height and splits
 * into an editor column (input with Save inside, status, then preview and
 * the detail strip anchored to the bottom) and a full-height reference
 * column, so the extra width and height are actually used.
 */
function PanelLayout({
  detail,
  editor,
  preview,
  reference,
  save,
  status,
  wide,
}: PanelLayoutProps): ReactNode {
  if (!wide) {
    return (
      <div className="flex w-full flex-col gap-1.5 p-1">
        <span className="px-0.5 font-medium text-muted-foreground text-xs">
          Formula
        </span>
        {editor}
        {status}
        {preview}
        {reference}
        {detail}
        <div className="flex justify-end">{save}</div>
      </div>
    );
  }
  return (
    <div className="grid h-[30rem] max-h-[65svh] w-full grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        {editor}
        {status}
        <div className="mt-auto flex flex-col gap-1.5">
          {preview}
          {detail}
        </div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-col gap-1.5">{reference}</div>
    </div>
  );
}

/**
 * Wide layouts wrap the editing surface in an InputGroup that draws the
 * chrome and hosts Save inside the text area (shadcn InputGroup block-end
 * addon pattern); the stack form renders the surface bare and the layout
 * places Save at the bottom.
 */
function EditorSlot({
  save,
  surface,
  wide,
}: {
  save: ReactNode;
  surface: ReactNode;
  wide: boolean;
}): ReactNode {
  if (!wide) {
    return surface;
  }
  return (
    <InputGroup className="h-auto focus-within:border-ring">
      {surface}
      <InputGroupAddon align="block-end" className="justify-end">
        {save}
      </InputGroupAddon>
    </InputGroup>
  );
}

/**
 * Arranges the mobile sheet's slots in one column: explicit header (Cancel /
 * "Formula" / Done — the sheet's only save affordance), editor, tappable
 * status pill, preview, then the rollup tools (button or open wizard). The
 * bottom padding clears the keyboard-anchored accessory row, which floats
 * over the sheet at the keyboard top (or the viewport bottom while the
 * keyboard is closed).
 */
function SheetLayout({
  editor,
  header,
  preview,
  status,
  tools,
}: {
  editor: ReactNode;
  header: ReactNode;
  preview: ReactNode;
  status: ReactNode;
  tools: ReactNode;
}): ReactNode {
  return (
    <div className="flex w-full flex-col gap-2 p-1 pb-16">
      {header}
      {editor}
      {status}
      {preview}
      {tools}
    </div>
  );
}

/**
 * The sheet's header row: Cancel backs out without saving, Done runs the
 * same save path (and the same parse-error gating) as the other layouts'
 * Save button. The title sits between them; a spacer keeps it centered when
 * the host passes no `onCancel`.
 */
function SheetHeader({
  doneDisabled,
  onCancel,
  onDone,
}: {
  doneDisabled: boolean;
  onCancel: (() => void) | undefined;
  onDone: () => void;
}): ReactNode {
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
      <span className="font-medium text-foreground text-sm">Formula</span>
      <Button
        className="pointer-coarse:h-10"
        disabled={doneDisabled}
        onClick={onDone}
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
function SheetRollupButton({
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
function StatusPill({
  checked,
  displayPosition,
  parsed,
}: {
  checked: FormulaCheckResult | null;
  displayPosition: (offset: number) => number;
  parsed: ParseFormulaResult | null;
}): ReactNode {
  const [expanded, setExpanded] = useState(false);
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
          "min-h-6 self-start rounded-full border px-2.5 py-0.5 text-xs",
          clean
            ? "border-border text-muted-foreground"
            : "border-destructive/40 text-destructive"
        )}
        onClick={() => {
          setExpanded((value) => !value);
        }}
        type="button"
      >
        {clean
          ? `✓ ${checked === null ? "Valid" : formulaTypeBadge(checked.resultType)}`
          : `${issueCount} issue${issueCount === 1 ? "" : "s"}`}
      </button>
      {expanded ? statusLine(parsed, checked, displayPosition) : null}
    </div>
  );
}

/** The formula builder panel (see module docs). */
export function FormulaEditorPanel({
  expression,
  fields,
  layout = "stack",
  onCancel,
  onSave,
  previewRows,
  relatedDatabases,
  relations,
}: FormulaEditorPanelProps): ReactNode {
  const wide = layout === "wide";
  const sheet = layout === "sheet";
  // Canonical text (`prop("<id>")` references) — the CM6 doc edits it
  // natively; the textarea path humanizes for display below.
  const [draft, setDraft] = useState(expression);
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<ReferenceDetail | null>(null);
  /** Rollup template wizard swapped in for the reference list. */
  const [rollupOpen, setRollupOpen] = useState(false);
  /** Picked preview row; `null` (or a since-deleted id) falls back to first. */
  const [previewRowId, setPreviewRowId] = useState<string | null>(null);
  /** The chip the option menu is open for; `null` while closed. */
  const [chipTap, setChipTap] = useState<FormulaChipTap | null>(null);
  const coarsePointer = useIsCoarsePrimaryPointer();
  // The sheet layout mounts CM6 even on coarse pointers (its native touch
  // caret/IME handling is the point of the sheet); everywhere else coarse
  // pointers keep the plain textarea.
  const usesTextarea = coarsePointer && !sheet;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const codeEditorRef = useRef<FormulaCodeEditorHandle>(null);

  // Mounted only while the (sub)menu is open — steal focus from the popup
  // after Base UI's initial focus pass (same rAF pattern as the rename
  // input). Targets the textarea when it's rendered (coarse pointers, or the
  // Suspense fallback while the CM6 chunk loads); the code editor handles
  // its own autofocus once mounted.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  // What the textarea shows: the canonical draft with `prop("<id>")`
  // references humanized to names. humanize∘canonicalize is display-stable
  // (both pass unparseable text through, and resolvable name references
  // round-trip to themselves), so typing never sees the text change under
  // the caret.
  const displayDraft = useMemo(
    () => humanizeExpression(draft, fields, relatedDatabases),
    [draft, fields, relatedDatabases]
  );

  /**
   * Splice `text` at the caret (replacing any selection), then restore focus
   * with the caret `caretOffset` characters into the inserted text. Goes
   * through the CM6 handle when the code editor is mounted (its doc is the
   * canonical draft); otherwise through the textarea's selection range
   * (which survives blur) — those offsets index the DISPLAY text, so the
   * splice happens there and the result re-canonicalizes into the draft.
   */
  const insertAtCaret = (text: string, caretOffset: number) => {
    const editor = codeEditorRef.current;
    if (editor !== null) {
      editor.insertText(text, caretOffset);
      return;
    }
    const element = textareaRef.current;
    const start = element?.selectionStart ?? displayDraft.length;
    const end = element?.selectionEnd ?? displayDraft.length;
    const nextDisplay =
      displayDraft.slice(0, start) + text + displayDraft.slice(end);
    setDraft(
      canonicalizeExpression(nextDisplay, fields, relatedDatabases).text
    );
    const caret = start + caretOffset;
    requestAnimationFrame(() => {
      const target = textareaRef.current;
      if (target) {
        target.focus();
        target.setSelectionRange(caret, caret);
      }
    });
  };

  /**
   * Property rows insert per surface: the CM6 editor takes the canonical
   * `prop("<id>")` text directly (it renders as an atomic chip, caret placed
   * after it); the textarea takes the display `thisPage.Name` form.
   */
  const insertPropertyReference = (propertyField: DatabaseField) => {
    const editor = codeEditorRef.current;
    if (editor !== null) {
      const canonical = canonicalPropertyReference(propertyField.id);
      editor.insertText(canonical, canonical.length);
      return;
    }
    const display = formulaPropertyReference(propertyField.name);
    insertAtCaret(display, display.length);
  };

  /**
   * Function rows insert per surface: the CM6 editor takes the
   * argument-placeholder snippet — `round(value, digits?)` with the first
   * placeholder selected, Tab walking the rest (proposal §7, the Numbers
   * trick) — via the handle's `insertSnippet`; the textarea keeps the plain
   * `name()` insert with the caret inside the parens (placeholders are a
   * CM6 affordance).
   */
  const insertFunctionEntry = (entry: FormulaFunctionEntry) => {
    const editor = codeEditorRef.current;
    if (editor !== null) {
      editor.insertSnippet(entry.name, entry.params.map(formulaParamLabel));
      return;
    }
    insertAtCaret(`${entry.name}()`, entry.name.length + 1);
  };

  /**
   * Chip menu dismissed without an action (Escape/outside-click): hand focus
   * back to the editor so typing can continue where the tap interrupted it.
   */
  const closeChipMenu = () => {
    setChipTap(null);
    requestAnimationFrame(() => {
      codeEditorRef.current?.focus();
    });
  };

  /** Chip menu → Remove: delete the tapped reference's whole canonical span. */
  const removeChipReference = () => {
    if (chipTap !== null) {
      codeEditorRef.current?.replaceRange(chipTap.from, chipTap.to, "");
    }
    setChipTap(null);
  };

  /** Chip menu → Change property: swap the reference in place. */
  const swapChipReference = (field: DatabaseField) => {
    if (chipTap !== null) {
      codeEditorRef.current?.replaceRange(
        chipTap.from,
        chipTap.to,
        canonicalPropertyReference(field.id)
      );
    }
    setChipTap(null);
  };

  /** Chip menu → Change database: swap the db reference in place. */
  const swapChipDatabase = (database: FormulaRefDatabase) => {
    if (chipTap !== null) {
      codeEditorRef.current?.replaceRange(
        chipTap.from,
        chipTap.to,
        canonicalDatabaseReference(database.id)
      );
    }
    setChipTap(null);
  };

  /** Wizard output lands like property references do (see the helper). */
  const insertGeneratedExpression = (generated: string) => {
    setRollupOpen(false);
    spliceGeneratedExpression(generated, {
      codeEditorRef,
      databases: relatedDatabases,
      draft,
      fields,
      insertAtCaret,
      setDraft,
      textareaRef,
    });
  };

  const trimmed = draft.trim();
  const parsed = trimmed === "" ? null : parseFormula(draft);

  // Static check of the parsed draft against the schema — formula fields
  // typed via the same topological pass the overlay uses; related databases
  // (when supplied) type member access on relation rows.
  const checkContext = useMemo(
    () => formulaCheckContext(fields, relatedDatabases),
    [fields, relatedDatabases]
  );
  const checked: FormulaCheckResult | null = useMemo(
    () => (parsed?.ok ? checkFormula(parsed.ast, checkContext) : null),
    [parsed, checkContext]
  );

  // Save/Done require a VALID formula: no parse error and no checker
  // diagnostics. Blank drafts stay saveable (clearing a formula is legit).
  // Shared by the Save/Done buttons and the code editor's Mod+Enter (which
  // fires regardless, so it must self-gate).
  const saveDisabled =
    parsed !== null && (!parsed.ok || (checked?.diagnostics.length ?? 0) > 0);
  const save = () => {
    if (saveDisabled) {
      return;
    }
    onSave(canonicalizeExpression(draft, fields, relatedDatabases).text);
  };

  // The picked preview row, defaulting to the first (and healing a stale
  // pick — the picked row can be deleted while the panel is open).
  const previewRow =
    previewRows.find((row) => row.id === previewRowId) ??
    previewRows[0] ??
    null;

  // Live preview against the picked row: evaluate the parsed draft through
  // the same scope the real overlay uses — other formula fields resolve to
  // their computed values; errors render honestly ("⚠ …").
  const previewValues = previewRow?.values ?? null;
  const preview = useMemo(() => {
    if (!parsed?.ok || previewValues === null) {
      return null;
    }
    const now = () => new Date();
    const resolved = computeFormulaRowValues(fields, previewValues, {
      now,
      relations,
    });
    const scope = createFormulaRowScope(fields, previewValues, resolved, {
      now,
      relations,
    });
    return formulaValueToDisplay(evaluateFormula(parsed.ast, scope), {
      rowLabel: formulaRowLabelOf(relations),
    });
  }, [parsed, fields, previewValues, relations]);

  // Canonical-offset → visible-offset mapping for status positions: each
  // `prop("<id>")` / `db("<id>")` span before an offset renders shorter than
  // its canonical text — as a name-labeled chip in the CM6 editor, as the
  // humanized `thisPage.Name` / `db("Name")` reference in the textarea
  // (unknown ids stay canonical there; a chip shows the raw id). Keyed off
  // which surface the layout and pointer class mount (the sheet mounts CM6
  // even on coarse pointers).
  const displayPosition = useMemo(() => {
    const fieldsById = new Map(fields.map((field) => [field.id, field]));
    const databasesById = new Map(
      (relatedDatabases ?? []).map((database) => [database.id, database])
    );
    const propLabelLength = (id: string): number => {
      const field = fieldsById.get(id);
      if (usesTextarea) {
        return field === undefined
          ? canonicalPropertyReference(id).length
          : formulaPropertyReference(field.name).length;
      }
      return field === undefined ? id.length : field.name.length;
    };
    const dbLabelLength = (id: string): number => {
      const database = databasesById.get(id);
      if (usesTextarea) {
        // Known ids humanize to db("Name"); unknown ones stay canonical.
        return canonicalDatabaseReference(database?.name ?? id).length;
      }
      return database === undefined ? id.length : database.name.length;
    };
    return (offset: number) =>
      referenceDisplayOffset(draft, offset, propLabelLength, dbLabelLength);
  }, [draft, fields, relatedDatabases, usesTextarea]);

  // The Rollup template affordance shows only when a rollup is buildable: a
  // relation field whose target database the caller resolved.
  const rollupAvailable = useMemo(
    () => formulaRollupRelationFields(fields, relatedDatabases).length > 0,
    [fields, relatedDatabases]
  );

  const normalizedQuery = query.trim().toLowerCase();

  // Formula fields are insertable references too (formulas may reference
  // other formulas); a self-reference surfaces as a named cycle error.
  const propertyFields = useMemo(
    () =>
      fields.filter((field) =>
        field.name.toLowerCase().includes(normalizedQuery)
      ),
    [fields, normalizedQuery]
  );

  const functionEntries = useMemo(
    () =>
      FORMULA_FUNCTION_CATALOG.map((entry) => ({
        ...entry,
        signature: formulaFunctionSignature(entry),
      })).filter((entry) =>
        [
          entry.name,
          ...(entry.aliases ?? []),
          entry.signature,
          entry.category,
          entry.description,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      ),
    [normalizedQuery]
  );

  const operatorEntries = useMemo(
    () =>
      FORMULA_OPERATOR_CATALOG.filter((entry) =>
        `${entry.symbol} ${entry.category} ${entry.description}`
          .toLowerCase()
          .includes(normalizedQuery)
      ),
    [normalizedQuery]
  );

  const statusRow = (
    <StatusRow
      checked={checked}
      displayPosition={displayPosition}
      parsed={parsed}
    />
  );

  // The plain-textarea input: the whole editor on coarse pointers outside
  // the sheet layout, and the Suspense fallback while the CM6 chunk loads
  // everywhere else.
  // In the wide layout the editing surface sits inside an InputGroup that
  // draws the border (the Save addon lives inside it), so the surface itself
  // goes chromeless.
  const chromeless =
    "rounded-none border-0 bg-transparent focus-visible:border-transparent dark:bg-transparent";
  const expressionTextarea = (
    <Textarea
      aria-label="Formula expression"
      autoComplete="off"
      className={cn(
        "max-h-32 min-h-16 font-mono text-xs md:text-xs",
        wide && cn("max-h-72 min-h-40", chromeless)
      )}
      onChange={(event) => {
        setDraft(
          canonicalizeExpression(event.target.value, fields, relatedDatabases)
            .text
        );
      }}
      onKeyDown={stopMenuKeys}
      placeholder="thisPage.Price * 1.1"
      ref={textareaRef}
      spellCheck={false}
      value={displayDraft}
    />
  );

  const saveButton = (
    <Button disabled={saveDisabled} onClick={save} size="xs">
      Save
    </Button>
  );

  // The wide (dialog) editor gets more vertical room than the menu form.
  // CM injects its theme stylesheet after ours, so the height overrides need
  // `!` to beat the theme's fixed min/max rules at equal specificity.
  const editorSurface = (
    <div
      className={cn(
        "flex min-w-0 flex-col",
        wide && "w-full [&_.cm-content]:min-h-40! [&_.cm-scroller]:max-h-72!"
      )}
    >
      {usesTextarea ? (
        expressionTextarea
      ) : (
        <FormulaCodeEditorBoundary fallback={expressionTextarea}>
          <Suspense fallback={expressionTextarea}>
            <FormulaCodeEditor
              ariaLabel="Formula expression"
              autoFocus
              checkContext={checkContext}
              className={wide ? chromeless : undefined}
              databases={relatedDatabases}
              editorRef={codeEditorRef}
              fields={fields}
              onChange={setDraft}
              onChipTap={setChipTap}
              onSubmit={save}
              placeholder="thisPage.Price * 1.1"
              value={draft}
            />
          </Suspense>
        </FormulaCodeEditorBoundary>
      )}
      {usesTextarea ? null : (
        <FormulaChipMenu
          databases={relatedDatabases}
          fields={fields}
          onClose={closeChipMenu}
          onPickDatabase={swapChipDatabase}
          onPickProperty={swapChipReference}
          onRemove={removeChipReference}
          tap={chipTap}
        />
      )}
    </div>
  );

  const editor = (
    <EditorSlot save={saveButton} surface={editorSurface} wide={wide} />
  );

  const previewLine = (
    <FormulaPreviewLine
      onPickRow={setPreviewRowId}
      pickedRow={previewRow}
      preview={preview}
      rows={previewRows}
    />
  );

  // The open wizard replaces the reference browser (stack/wide) or the
  // Rollup button (sheet), so both layouts share one element.
  const wizard =
    rollupOpen && relatedDatabases !== undefined ? (
      <FormulaRollupWizard
        checkContext={checkContext}
        fields={fields}
        onClose={() => {
          setRollupOpen(false);
        }}
        onInsert={insertGeneratedExpression}
        onShowDetail={setDetail}
        relatedDatabases={relatedDatabases}
      />
    ) : null;

  const reference = wizard ?? (
    <>
      <div className="flex items-center gap-1.5">
        <InputGroup className="h-8 flex-1">
          <InputGroupAddon align="inline-start">
            <InputGroupText>
              <IconSearch />
            </InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search properties, functions, and operators"
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            onKeyDown={stopMenuKeys}
            placeholder="Search reference…"
            value={query}
          />
        </InputGroup>
        {rollupAvailable ? (
          <Button
            className="shrink-0"
            onClick={() => {
              setRollupOpen(true);
            }}
            variant="outline"
          >
            <IconSum />
            Rollup
          </Button>
        ) : null}
      </div>
      <ReferenceList
        className={wide ? "max-h-none min-h-0 flex-1" : undefined}
        entries={{ functionEntries, operatorEntries, propertyFields }}
        onInsertAtCaret={insertAtCaret}
        onInsertFunction={insertFunctionEntry}
        onInsertProperty={insertPropertyReference}
        onShowDetail={setDetail}
      />
    </>
  );

  if (sheet) {
    // No search/reference list/detail strip — the accessory row's picker
    // drawers cover insertion; the Rollup button keeps the wizard reachable.
    return (
      <>
        <SheetLayout
          editor={editorSurface}
          header={
            <SheetHeader
              doneDisabled={saveDisabled}
              onCancel={onCancel}
              onDone={save}
            />
          }
          preview={previewLine}
          status={
            <StatusPill
              checked={checked}
              displayPosition={displayPosition}
              parsed={parsed}
            />
          }
          tools={
            wizard ?? (
              <SheetRollupButton
                available={rollupAvailable}
                onOpen={() => {
                  setRollupOpen(true);
                }}
              />
            )
          }
        />
        <FormulaEditorAccessoryRow
          fields={fields}
          onInsertAtCaret={insertAtCaret}
          onInsertFunction={insertFunctionEntry}
          onInsertProperty={insertPropertyReference}
        />
      </>
    );
  }

  return (
    <PanelLayout
      detail={<DetailStrip detail={detail} />}
      editor={editor}
      preview={previewLine}
      reference={reference}
      save={saveButton}
      status={statusRow}
      wide={wide}
    />
  );
}
