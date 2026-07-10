import { IconMathFunction, IconSearch } from "@tabler/icons-react";
import {
  Component,
  type KeyboardEvent,
  lazy,
  type ReactNode,
  // biome-ignore lint/correctness/noUnresolvedImports: React 19 exports Suspense; Biome types lag
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { resolveFieldIcon } from "@/components/database/database-field-icons.ts";
import type { FormulaCodeEditorHandle } from "@/components/database/formula-code-editor.tsx";
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
  formulaCheckContext,
} from "@/lib/databases/formula-values.ts";
import {
  FORMULA_FUNCTION_CATALOG,
  FORMULA_OPERATOR_CATALOG,
  formulaFunctionSignature,
  formulaPropertyReference,
} from "@/lib/formula/catalog.ts";
import {
  checkFormula,
  type FormulaCheckResult,
  formulaTypeBadge,
} from "@/lib/formula/check.ts";
import { formulaValueToDisplay } from "@/lib/formula/display.ts";
import { evaluateFormula } from "@/lib/formula/evaluate.ts";
import { type ParseFormulaResult, parseFormula } from "@/lib/formula/parse.ts";
import {
  canonicalizeExpression,
  canonicalPropertyReference,
  humanizeExpression,
} from "@/lib/formula/ref-rewrite.ts";
import { createFormulaRowScope } from "@/lib/formula/row-scope.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Shared formula BUILDER panel (Notion-style): expression textarea with live
 * parse/check status (first checker diagnostic, or "✓ Valid" plus the
 * result-type badge) and a first-row preview on top, then a searchable
 * reference of Properties / Functions / Operators that insert at the caret,
 * with a fixed-height detail strip documenting the focused entry.
 * Width-fluid so it works both in the desktop column-menu submenu (~360px)
 * and full-width in the mobile menu drawer.
 *
 * The `draft` state is the CANONICAL expression (`prop("<id>")` — exactly
 * what gets stored), so parse/check/preview/save all operate on it directly.
 * The CM6 editor edits the canonical text natively and renders property
 * spans as schema-labeled chips; the plain textarea (coarse pointers, and
 * the Suspense/error fallback on fine ones) displays
 * `humanizeExpression(draft)` and re-canonicalizes on every change —
 * humanize∘canonicalize is display-stable, so users still only ever see
 * names there. Save is blocked only by parse errors — checker diagnostics
 * warn but still save (the overlay degrades per-cell, never crashes). Save
 * runs one final `canonicalizeExpression` (idempotent; catches any typed
 * name refs the editor hasn't converted yet) and hands the canonical text to
 * the caller's `onSave` unconditionally (so the menu can close); the caller
 * compares against the stored expression and skips the write for unchanged
 * drafts.
 *
 * On fine pointers the expression input is the lazy-loaded CodeMirror 6
 * editor (formula-code-editor.tsx) — chips, syntax highlighting, soft wrap,
 * Mod+Enter saves — with the plain textarea as the Suspense fallback while
 * the CM6 chunk loads. Coarse pointers keep the textarea entirely (mobile
 * gets its own treatment in a later phase). Caret insertion from the
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
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
): void {
  if (event.key !== "Escape") {
    event.stopPropagation();
  }
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
 * Left half of the status row: the first parse error, else the first checker
 * diagnostic (both with a 1-based character position), else "✓ Valid".
 * `null` for a blank draft.
 */
function statusLine(
  parsed: ParseFormulaResult | null,
  checked: FormulaCheckResult | null
): ReactNode {
  if (parsed === null) {
    return null;
  }
  if (!parsed.ok) {
    return (
      <span className="min-w-0 truncate text-destructive text-xs">
        {parsed.error.message} (at character {parsed.error.position + 1})
      </span>
    );
  }
  const firstDiagnostic = checked?.diagnostics[0];
  if (firstDiagnostic !== undefined) {
    return (
      <span className="min-w-0 truncate text-destructive text-xs">
        {firstDiagnostic.message} (at character {firstDiagnostic.start + 1})
      </span>
    );
  }
  return (
    <span className="min-w-0 truncate text-muted-foreground text-xs">
      ✓ Valid
    </span>
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

export interface FormulaEditorPanelProps {
  /** Stored (canonical) expression the draft starts from. */
  expression: string;
  /**
   * Full database schema: non-formula fields become the Properties section,
   * and the whole list feeds the preview scope.
   */
  fields: readonly DatabaseField[];
  /** First row's cell values for the live preview; `null` when the table is empty. */
  firstRowValues: Record<string, DatabaseCellValue> | null;
  /** Called with the CANONICAL text on Save (even when unchanged — the caller decides). */
  onSave: (expression: string) => void;
}

/** The formula builder panel (see module docs). */
export function FormulaEditorPanel({
  expression,
  fields,
  firstRowValues,
  onSave,
}: FormulaEditorPanelProps): ReactNode {
  // Canonical text (`prop("<id>")` references) — the CM6 doc edits it
  // natively; the textarea path humanizes for display below.
  const [draft, setDraft] = useState(expression);
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<ReferenceDetail | null>(null);
  const coarsePointer = useIsCoarsePrimaryPointer();
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
    () => humanizeExpression(draft, fields),
    [draft, fields]
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
    setDraft(canonicalizeExpression(nextDisplay, fields).text);
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

  const trimmed = draft.trim();
  const parsed = trimmed === "" ? null : parseFormula(draft);

  // Save is blocked only by parse errors; shared by the Save button and the
  // code editor's Mod+Enter (which fires regardless, so it must self-gate).
  const saveDisabled = parsed !== null && !parsed.ok;
  const save = () => {
    if (saveDisabled) {
      return;
    }
    onSave(canonicalizeExpression(draft, fields).text);
  };

  // Static check of the parsed draft against the schema — formula fields
  // typed via the same topological pass the overlay uses.
  const checkContext = useMemo(() => formulaCheckContext(fields), [fields]);
  const checked: FormulaCheckResult | null = useMemo(
    () => (parsed?.ok ? checkFormula(parsed.ast, checkContext) : null),
    [parsed, checkContext]
  );

  // Live preview against the FIRST row: evaluate the parsed draft through
  // the same scope the real overlay uses — other formula fields resolve to
  // their computed values; errors render honestly ("⚠ …").
  const preview = useMemo(() => {
    if (!parsed?.ok || firstRowValues === null) {
      return null;
    }
    const now = () => new Date();
    const resolved = computeFormulaRowValues(fields, firstRowValues, { now });
    const scope = createFormulaRowScope(fields, firstRowValues, resolved, {
      now,
    });
    return formulaValueToDisplay(evaluateFormula(parsed.ast, scope));
  }, [parsed, fields, firstRowValues]);

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

  const nothingMatches =
    propertyFields.length === 0 &&
    functionEntries.length === 0 &&
    operatorEntries.length === 0;

  const statusRow =
    parsed === null ? null : (
      <div className="flex items-center justify-between gap-2 px-0.5">
        {statusLine(parsed, checked)}
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

  // The plain-textarea input: the whole editor on coarse pointers (mobile
  // gets its own treatment in a later phase), and the Suspense fallback
  // while the CM6 chunk loads on fine pointers.
  const expressionTextarea = (
    <Textarea
      aria-label="Formula expression"
      autoComplete="off"
      className="max-h-32 min-h-16 font-mono text-xs md:text-xs"
      onChange={(event) => {
        setDraft(canonicalizeExpression(event.target.value, fields).text);
      }}
      onKeyDown={stopMenuKeys}
      placeholder="thisPage.Price * 1.1"
      ref={textareaRef}
      spellCheck={false}
      value={displayDraft}
    />
  );

  return (
    <div className="flex w-full flex-col gap-1.5 p-1">
      <span className="px-0.5 font-medium text-muted-foreground text-xs">
        Formula
      </span>
      {coarsePointer ? (
        expressionTextarea
      ) : (
        <FormulaCodeEditorBoundary fallback={expressionTextarea}>
          <Suspense fallback={expressionTextarea}>
            <FormulaCodeEditor
              ariaLabel="Formula expression"
              autoFocus
              editorRef={codeEditorRef}
              fields={fields}
              onChange={setDraft}
              onSubmit={save}
              placeholder="thisPage.Price * 1.1"
              value={draft}
            />
          </Suspense>
        </FormulaCodeEditorBoundary>
      )}
      {statusRow}
      {preview === null ? null : (
        <span className="truncate px-0.5 text-muted-foreground text-xs">
          Preview: {preview === "" ? "(empty)" : preview}
        </span>
      )}
      <InputGroup className="h-8">
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
      <ScrollArea className="max-h-52 overflow-hidden rounded-md border border-border">
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
                  insertPropertyReference(propertyField);
                }}
                onShowDetail={setDetail}
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
                // Caret lands inside the parens, ready for arguments.
                insertAtCaret(`${entry.name}()`, entry.name.length + 1);
              }}
              onShowDetail={setDetail}
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
                insertAtCaret(` ${entry.symbol} `, entry.symbol.length + 2);
              }}
              onShowDetail={setDetail}
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
      <Button
        className="self-end"
        disabled={saveDisabled}
        onClick={save}
        size="xs"
        variant="outline"
      >
        Save
      </Button>
    </div>
  );
}
