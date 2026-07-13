import {
  acceptCompletion,
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  completionStatus,
  startCompletion,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import {
  type EditorSelection,
  EditorState,
  Prec,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type Transaction,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  placeholder as placeholderOf,
  showTooltip,
  type Tooltip,
  tooltips,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import { DATABASE_FIELD_TYPE_ICON_NODES } from "@/components/database/database-field-icons.ts";
import { tokenChipVariants } from "@/components/ui/chip.tsx";
import { formulaCheckContext } from "@/lib/databases/formula-values.ts";
import {
  FORMULA_FUNCTION_CATALOG,
  type FormulaFunctionEntry,
  formulaFunctionForName,
  formulaFunctionSignature,
  formulaParamAt,
  formulaParamLabel,
} from "@/lib/formula/catalog.ts";
import {
  checkFormula,
  type FormulaCheckContext,
  formulaPropertyValueType,
  formulaTypeBadge,
  formulaTypeFits,
  normalizeFormulaPropertyName,
} from "@/lib/formula/check.ts";
import {
  type FormulaHighlightKind,
  formulaDbIdSpans,
  formulaEnclosingCallAt,
  formulaPropIdSpans,
  highlightFormula,
} from "@/lib/formula/highlight.ts";
import { FORMULA_SCOPE_ROOTS, parseFormula } from "@/lib/formula/parse.ts";
import {
  canonicalDatabaseReference,
  canonicalPropertyReference,
  canonicalPropertyRewrites,
  type FormulaRefDatabase,
  type FormulaSpanRewrite,
} from "@/lib/formula/ref-rewrite.ts";
import {
  BOOLEAN_TYPE,
  type FormulaType,
  UNKNOWN_TYPE,
} from "@/lib/formula/types.ts";
import { formulaUserFunctionSignature } from "@/lib/formula/user-functions.ts";
import type { FormulaPreparedUserFunction } from "@/lib/formula/values.ts";
import {
  TABLER_PAGE_ICON_PREFIX,
  type TablerIconNode,
} from "@/lib/pages/page-icon.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * CodeMirror 6 single-expression formula editor (desktop). Controlled via
 * `value`/`onChange`; imperative caret insertion via the `editorRef` handle
 * (same named-ref-prop pattern as grid-picker's `virtualizerRef`). This
 * module imports CM6 at module scope and is intended to be loaded through
 * `React.lazy` (see formula-editor-panel.tsx) so the CM6 chunk stays out of
 * the main bundle.
 *
 * The document is the CANONICAL expression (`prop("<fieldId>")` /
 * `db("<databaseId>")` references — exactly what gets stored). Canonical
 * reference spans render as atomic labeled chips: `Decoration.replace`
 * widgets over the canonical text plus `EditorView.atomicRanges`, so arrow
 * keys skip a chip, backspace/delete removes the whole reference, and
 * selection treats it as one unit. Property chips ({@link PropertyChipWidget})
 * label from the live schema (`fields` prop → {@link chipFields} state
 * field); database chips ({@link DatabaseChipWidget}, purple tone, database
 * glyph) label from the workspace databases (`databases` prop →
 * {@link chipDatabases}), so a rename while the editor is open relabels
 * chips in place; ids matching nothing render a destructive
 * "Unknown property"/"Unknown database" chip. Hand-typed display references
 * (`thisPage.X`, `db("Name")`) stay plain highlighted text while typing and
 * are converted to canonical chips shortly after the reference is complete
 * AND the caret has left its span ({@link typedReferenceCanonicalizer}).
 *
 * Soft-wrapped, autogrowing (min ~3 rows, capped with internal scroll), no
 * line numbers, syntax highlighting driven by the real tokenizer
 * ({@link highlightFormula}).
 *
 * FUSED AUTOCOMPLETE (proposal §6.2): one completion source
 * ({@link formulaCompletionSource}) merges properties (insert as canonical
 * chips), catalog functions (caret lands inside the parens), and the word
 * operators/keywords, opened by typing an identifier or explicit Ctrl+Space.
 * Ranking is type-aware: when the caret sits in an argument position whose
 * expected type the catalog knows ({@link expectedArgumentType}), candidates
 * whose result type fits rank first.
 *
 * DIAGNOSTICS (proposal §6): parse errors and checker diagnostics render as
 * destructive wavy underlines, debounced like the canonicalizer
 * ({@link diagnosticsScheduler}); a span falling inside an atomic chip rings
 * the WHOLE chip (via the widget itself — see {@link FormulaDiagnostics})
 * rather than underlining a fragment of hidden canonical text. The check
 * runs against the panel's memoized
 * {@link FormulaCheckContext} (a state field, like {@link chipFields}) — it
 * is never recomputed per keystroke here.
 *
 * CHIP TAP = MENU (proposal §7, deferred from §6): when the host wires
 * `onChipTap`, presses landing ON a chip are intercepted (mousedown swallowed
 * so the caret never jumps to the chip boundary; click reports the tap) and
 * surfaced with the chip's DOM node — the anchor for the host's option menu —
 * plus the canonical span resolved from the CURRENT doc at tap time
 * ({@link chipTapAt}; widget spans move as the doc changes, so build-time
 * offsets would go stale). The menu applies its actions through the handle's
 * `replaceRange`. Without the prop, chip clicks keep CM's default
 * caret-at-boundary behavior, and caret placement AROUND chips plus
 * whole-chip backspace are untouched either way.
 *
 * ARGUMENT PLACEHOLDERS (proposal §7, the Numbers trick): inserting a
 * function with parameters — via the handle's `insertSnippet` (reference
 * list, mobile function picker) or the fused autocomplete — lands the
 * snippet form `dateAdd(date, amount, unit)`. The doc text IS the parameter
 * labels ({@link insertSnippetAt}) — plain text, so parse/diagnostics treat
 * them as ordinary tokens and Save stays gated until they're replaced —
 * while a state field ({@link placeholderField}) tracks each label's span
 * and styles it as a muted pill via `Decoration.mark` (never
 * `Decoration.replace`: nothing is hidden, nothing can persist). The first
 * placeholder is SELECTED on insert so typing replaces it; Tab/Shift-Tab
 * select the next/previous placeholder (after the completion popup's own
 * Tab-accept, and falling through when none remains); pressing a pill
 * selects its whole range ({@link selectPlaceholderPress}). A placeholder
 * leaves the set the moment its text stops matching its label (typing over
 * the selection), and Mod+Enter clears the set before submitting.
 *
 * ARGUMENT INFO CARD (proposal §6.2): while the caret sits inside a function
 * call's argument list, a small tooltip anchored at the callee shows the
 * signature with the CURRENT parameter emphasized plus the one-line
 * description ({@link functionInfoCard}); dot-chained method calls offset
 * the parameter index by one (the receiver occupies param 0). Hidden while
 * the completion popup is open. Hovering a squiggle shows no tooltip yet
 * (the status row carries the first message) — future polish.
 *
 * Menu integration is built in: every key except Escape stops propagating
 * (the panel lives inside a Base UI menu popup whose typeahead would
 * otherwise steal keystrokes), Escape closes the completion popup WITHOUT
 * bubbling while it's open and bubbles (closing the menu) otherwise, and
 * Mod+Enter fires `onSubmit`. The completion tooltip parents to
 * `document.body` so the menu popup's overflow can't clip it.
 */

/** Imperative surface the panel drives for reference-list caret insertion. */
export interface FormulaCodeEditorHandle {
  /** Focus the editor without moving the caret. */
  focus: () => void;
  /**
   * Splice `name(p1, p2, …)` at the caret with an argument-placeholder pill
   * over each param label and the FIRST placeholder selected, so typing
   * replaces it (proposal §7; see the ARGUMENT PLACEHOLDERS module docs).
   * Zero params insert `name()` with the caret after the parens.
   */
  insertSnippet: (name: string, params: readonly string[]) => void;
  /**
   * Splice `text` at the caret (replacing any selection), then place the
   * caret `caretOffset` characters into the inserted text and refocus.
   */
  insertText: (text: string, caretOffset: number) => void;
  /**
   * Replace the doc span `[from, to)` with `text` (empty text deletes the
   * span), place the caret after the inserted text, and refocus — the chip
   * option menu's apply path (swap a reference in place / remove it).
   * Offsets clamp to the doc so a stale span can never throw.
   */
  replaceRange: (from: number, to: number, text: string) => void;
}

/**
 * One chip press routed to the host (see the CHIP TAP module docs): the
 * chip's rendered DOM node — the anchor for the host's option menu — and the
 * canonical `prop("<id>")` / `db("<id>")` span it stood for, resolved from
 * the CURRENT doc at tap time.
 */
export interface FormulaChipTap {
  /** The chip's DOM node, for anchoring the option menu. */
  anchor: HTMLElement;
  /** Canonical span start (inclusive) in the current doc. */
  from: number;
  /** Which reference kind the chip stands for. */
  kind: "database" | "property";
  /**
   * The referenced field/database id per `kind` (may match nothing live for
   * broken chips).
   */
  refId: string;
  /** Canonical span end (exclusive) in the current doc. */
  to: number;
}

export interface FormulaCodeEditorProps {
  /** Accessible name for the editable region. */
  ariaLabel: string;
  /** Steal focus after mount (post-rAF, past Base UI's initial focus pass). */
  autoFocus?: boolean;
  /**
   * Schema context the debounced diagnostics check drafts against. Pass a
   * MEMOIZED value (the panel already memoizes `formulaCheckContext(fields)`)
   * — it is deliberately a prop, not derived here, so the editor never
   * recomputes it per keystroke.
   */
  checkContext: FormulaCheckContext;
  /**
   * Host-div class overrides — e.g. the panel's dialog layout strips the
   * default Textarea chrome when the editor sits inside an InputGroup that
   * draws the border itself.
   */
  className?: string;
  /**
   * Workspace databases visible to `db("…")` references: db-chip labels,
   * the db-name autocomplete, and typed-name canonicalization all read it.
   * Same live-currency contract as `fields` (a database rename relabels open
   * db chips). Omitted, db spans still chip but every id reads as unknown
   * and no db completions are offered.
   */
  databases?: readonly FormulaRefDatabase[];
  /** Receives the imperative handle; `null` while unmounted. */
  editorRef?: RefObject<FormulaCodeEditorHandle | null>;
  /**
   * Live database schema: chip labels/icons recompute from it, so pass the
   * CURRENT fields on every render (a rename relabels open chips).
   */
  fields: readonly DatabaseField[];
  onChange: (value: string) => void;
  /**
   * A click/tap landed on a reference chip — property or database (see the
   * CHIP TAP module docs). When wired, chip presses are intercepted and
   * reported instead of placing the caret; absent, chip clicks keep CM's
   * caret-at-boundary default.
   */
  onChipTap?: (tap: FormulaChipTap) => void;
  /** Mod+Enter (Cmd on mac, Ctrl elsewhere) — the panel wires Save here. */
  onSubmit?: () => void;
  placeholder?: string;
  value: string;
}

/** One cached mark decoration per highlight kind. */
const HIGHLIGHT_MARKS = new Map<FormulaHighlightKind, Decoration>();

function highlightMark(kind: FormulaHighlightKind): Decoration {
  let mark = HIGHLIGHT_MARKS.get(kind);
  if (mark === undefined) {
    mark = Decoration.mark({ class: `cm-formula-${kind}` });
    HIGHLIGHT_MARKS.set(kind, mark);
  }
  return mark;
}

function buildHighlightDecorations(source: string): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const span of highlightFormula(source)) {
    builder.add(span.start, span.end, highlightMark(span.kind));
  }
  return builder.finish();
}

/**
 * Whole-document re-highlight on every doc change. Fine at our scale: input
 * is capped at 10k characters (`MAX_EXPRESSION_LENGTH`) and the classifier
 * is a single linear tokenize pass, so incremental ranges aren't worth it.
 */
const formulaHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildHighlightDecorations(view.state.doc.toString());
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = buildHighlightDecorations(
          update.state.doc.toString()
        );
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
);

/** Set by the React side whenever the `fields` prop changes. */
const setChipFields = StateEffect.define<readonly DatabaseField[]>();

/**
 * The live database schema inside editor state, so chip labels/tones always
 * reflect the CURRENT field names (a rename while the editor is open
 * relabels chips) without recreating the view.
 */
const chipFields = StateField.define<readonly DatabaseField[]>({
  create: () => [],
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setChipFields)) {
        return effect.value;
      }
    }
    return value;
  },
});

/** Set by the React side whenever the `databases` prop changes. */
const setChipDatabases = StateEffect.define<readonly FormulaRefDatabase[]>();

/**
 * The live workspace databases inside editor state — {@link chipFields}'
 * exact analog for `db("<id>")` chips, so a database rename relabels open
 * db chips without recreating the view.
 */
const chipDatabases = StateField.define<readonly FormulaRefDatabase[]>({
  create: () => [],
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setChipDatabases)) {
        return effect.value;
      }
    }
    return value;
  },
});

/** Set by the React side whenever the `checkContext` prop changes. */
const setCheckContext = StateEffect.define<FormulaCheckContext>();

const EMPTY_CHECK_CONTEXT: FormulaCheckContext = { properties: [] };

/**
 * The panel's memoized check context inside editor state (same pattern as
 * {@link chipFields}): the diagnostics pass reads it per check instead of
 * rebuilding `formulaCheckContext(fields)` per keystroke.
 */
const checkContextState = StateField.define<FormulaCheckContext>({
  create: () => EMPTY_CHECK_CONTEXT,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setCheckContext)) {
        return effect.value;
      }
    }
    return value;
  },
});

const SVG_NS = "http://www.w3.org/2000/svg";

/** Tabler node data → a real SVG element (no React in the widget DOM). */
function tablerIconSvg(node: TablerIconNode): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "size-3.5 shrink-0 self-center");
  for (const [tag, attrs] of node) {
    const child = document.createElementNS(SVG_NS, tag);
    for (const [name, attrValue] of Object.entries(attrs)) {
      child.setAttribute(name, String(attrValue));
    }
    svg.append(child);
  }
  return svg;
}

/**
 * The chip's leading glyph, mirroring `resolveFieldIcon`'s precedence where
 * that's possible without React: emoji custom icons render the character,
 * everything else (including `tabler:` custom glyphs, whose by-name fetch is
 * a React hook) falls back to the field-type icon.
 */
function chipIcon(field: DatabaseField): Element {
  const icon = field.icon;
  if (icon && !icon.startsWith(TABLER_PAGE_ICON_PREFIX)) {
    const emoji = document.createElement("span");
    emoji.setAttribute("aria-hidden", "true");
    emoji.className = "shrink-0 select-none self-center leading-none";
    emoji.textContent = icon;
    return emoji;
  }
  return tablerIconSvg(DATABASE_FIELD_TYPE_ICON_NODES[field.type]);
}

/**
 * Inline chip for one canonical `prop("<id>")` span. Extends the TokenChip
 * look by class (widget DOM is built directly — no React inside CM): blue
 * tone + field icon + current name for known fields; destructive tone,
 * strikethrough raw id, and "Unknown property" semantics when the id matches
 * no field. Vertical padding is stripped (`py-0`, baseline-aligned) so chips
 * don't disturb the line height.
 */
class PropertyChipWidget extends WidgetType {
  private readonly diagnosed: boolean;
  private readonly field: DatabaseField | null;
  private readonly rawId: string;

  constructor(field: DatabaseField | null, rawId: string, diagnosed: boolean) {
    super();
    this.diagnosed = diagnosed;
    this.field = field;
    this.rawId = rawId;
  }

  eq(other: PropertyChipWidget): boolean {
    return (
      other.rawId === this.rawId &&
      other.diagnosed === this.diagnosed &&
      other.field?.name === this.field?.name &&
      other.field?.type === this.field?.type &&
      other.field?.icon === this.field?.icon
    );
  }

  toDOM(): HTMLElement {
    const chip = document.createElement("span");
    chip.className = cn(
      tokenChipVariants({ tone: this.field === null ? "destructive" : "blue" }),
      // items-baseline (over the variant's items-center) makes the LABEL's
      // baseline the chip's baseline, so align-baseline lines the chip up
      // with the surrounding code text instead of synthesizing from the
      // chip's bottom edge (which floats the whole chip above the line).
      "cm-formula-chip select-none items-baseline py-0 align-baseline",
      this.field === null && "line-through",
      this.diagnosed && "cm-formula-chip-diagnosed"
    );
    if (this.field === null) {
      chip.title = "Unknown property";
      chip.setAttribute("aria-label", `Unknown property ${this.rawId}`);
    } else {
      chip.setAttribute("aria-label", `Property ${this.field.name}`);
      chip.append(chipIcon(this.field));
    }
    const label = document.createElement("span");
    label.className = "max-w-40 truncate";
    label.textContent = this.field?.name ?? this.rawId;
    chip.append(label);
    return chip;
  }

  /** Let CM handle clicks so the caret lands at the chip boundary. */
  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Tabler `IconDatabase` as raw node data, hand-copied like
 * `DATABASE_FIELD_TYPE_ICON_NODES` — the db-chip widget builds DOM without
 * React, and no field-type map entry covers "a whole database".
 */
const DATABASE_CHIP_ICON_NODE: TablerIconNode = [
  ["path", { d: "M4 6a8 3 0 1 0 16 0a8 3 0 1 0 -16 0" }],
  ["path", { d: "M4 6v6a8 3 0 0 0 16 0v-6" }],
  ["path", { d: "M4 12v6a8 3 0 0 0 16 0v-6" }],
];

/**
 * Inline chip for one `db("<id>")` span — {@link PropertyChipWidget}'s
 * database analog, sharing its baseline-alignment and unknown-id rules but
 * with a distinct purple tone (property chips are blue) and the database
 * glyph, so whole-database references read differently from same-row
 * property reads at a glance.
 */
class DatabaseChipWidget extends WidgetType {
  private readonly diagnosed: boolean;
  private readonly name: string | null;
  private readonly rawId: string;

  constructor(name: string | null, rawId: string, diagnosed: boolean) {
    super();
    this.diagnosed = diagnosed;
    this.name = name;
    this.rawId = rawId;
  }

  eq(other: DatabaseChipWidget): boolean {
    return (
      other.rawId === this.rawId &&
      other.diagnosed === this.diagnosed &&
      other.name === this.name
    );
  }

  toDOM(): HTMLElement {
    const chip = document.createElement("span");
    chip.className = cn(
      tokenChipVariants({
        tone: this.name === null ? "destructive" : "purple",
      }),
      // Same baseline trick as the property chip (see its toDOM comment).
      "cm-formula-chip select-none items-baseline py-0 align-baseline",
      this.name === null && "line-through",
      this.diagnosed && "cm-formula-chip-diagnosed"
    );
    if (this.name === null) {
      chip.title = "Unknown database";
      chip.setAttribute("aria-label", `Unknown database ${this.rawId}`);
    } else {
      chip.setAttribute("aria-label", `Database ${this.name}`);
      chip.append(tablerIconSvg(DATABASE_CHIP_ICON_NODE));
    }
    const label = document.createElement("span");
    label.className = "max-w-40 truncate";
    label.textContent = this.name ?? this.rawId;
    chip.append(label);
    return chip;
  }

  /** Let CM handle clicks so the caret lands at the chip boundary. */
  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Both reference-chip span kinds of `source` in one list — everything that
 * renders as an atomic chip. Shared by decoration building, diagnostics
 * (chip rings + squiggle widening), and tap resolution, so the three can't
 * disagree about what is a chip.
 */
function referenceChipSpans(
  source: string
): { end: number; id: string; kind: "database" | "property"; start: number }[] {
  return [
    ...formulaPropIdSpans(source).map((span) => ({
      ...span,
      kind: "property" as const,
    })),
    ...formulaDbIdSpans(source).map((span) => ({
      ...span,
      kind: "database" as const,
    })),
  ].sort((a, b) => a.start - b.start);
}

function buildChipDecorations(state: EditorState): DecorationSet {
  const fieldsById = new Map(
    state.field(chipFields).map((field) => [field.id, field])
  );
  const databasesById = new Map(
    state.field(chipDatabases).map((database) => [database.id, database])
  );
  const diagnosedStarts = state.field(diagnosticsField).diagnosedChipStarts;
  const builder = new RangeSetBuilder<Decoration>();
  for (const span of referenceChipSpans(state.doc.toString())) {
    const diagnosed = diagnosedStarts.has(span.start);
    const widget =
      span.kind === "property"
        ? new PropertyChipWidget(
            fieldsById.get(span.id) ?? null,
            span.id,
            diagnosed
          )
        : new DatabaseChipWidget(
            databasesById.get(span.id)?.name ?? null,
            span.id,
            diagnosed
          );
    builder.add(span.start, span.end, Decoration.replace({ widget }));
  }
  return builder.finish();
}

/**
 * Chip rendering + atomicity: `Decoration.replace` widgets over every
 * canonical reference span (property AND database), provided as
 * `atomicRanges` so cursor motion, deletion, and selection treat each chip
 * as a single unit. Rebuilds on diagnostics passes too — a diagnosed chip
 * renders its own destructive ring (see {@link FormulaDiagnostics}).
 */
const referenceChips = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildChipDecorations(view.state);
    }

    update(update: ViewUpdate) {
      const fieldsChanged =
        update.startState.field(chipFields) !== update.state.field(chipFields);
      const databasesChanged =
        update.startState.field(chipDatabases) !==
        update.state.field(chipDatabases);
      const diagnosticsChanged =
        update.startState.field(diagnosticsField).diagnosedChipStarts !==
        update.state.field(diagnosticsField).diagnosedChipStarts;
      if (
        update.docChanged ||
        fieldsChanged ||
        databasesChanged ||
        diagnosticsChanged
      ) {
        this.decorations = buildChipDecorations(update.state);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of(
        (view) => view.plugin(plugin)?.decorations ?? Decoration.none
      ),
  }
);

// --- chip tap → option menu ----------------------------------------------------

/** The chip element a pointer event landed on, if any. */
function chipEventTarget(event: MouseEvent): HTMLElement | null {
  const target = event.target;
  if (!(target instanceof Element)) {
    return null;
  }
  const chip = target.closest(".cm-formula-chip");
  return chip instanceof HTMLElement ? chip : null;
}

/**
 * Resolve a tapped chip to its canonical span in the CURRENT doc. The widget
 * deliberately stores no offsets — spans move as the doc changes, so a
 * build-time from/to would go stale; `posAtDOM` plus the same token-level
 * span scan the decorations use recovers the live positions. The exact-start
 * match wins; the containment fallback covers renderers that resolve the
 * widget DOM to an interior/boundary position.
 */
function chipTapAt(view: EditorView, chip: HTMLElement): FormulaChipTap | null {
  const pos = view.posAtDOM(chip, 0);
  const spans = referenceChipSpans(view.state.doc.toString());
  const span =
    spans.find((candidate) => candidate.start === pos) ??
    spans.find((candidate) => candidate.start < pos && pos <= candidate.end);
  if (span === undefined) {
    return null;
  }
  return {
    anchor: chip,
    from: span.start,
    kind: span.kind,
    refId: span.id,
    to: span.end,
  };
}

/**
 * Chip mousedown with a tap handler wired: swallow the press so CM neither
 * moves the caret to the chip boundary nor starts a selection drag there —
 * {@link emitChipTap} turns the subsequent click into the menu callback.
 * Unwired (or off-chip), the press falls through to CM untouched.
 */
function suppressChipPress(event: MouseEvent, wired: boolean): boolean {
  if (!(wired && chipEventTarget(event) !== null)) {
    return false;
  }
  event.preventDefault();
  return true;
}

/** Chip click with a tap handler wired: report the tap to the host. */
function emitChipTap(
  event: MouseEvent,
  view: EditorView,
  onChipTap: ((tap: FormulaChipTap) => void) | undefined
): boolean {
  if (onChipTap === undefined) {
    return false;
  }
  const chip = chipEventTarget(event);
  if (chip === null) {
    return false;
  }
  const tap = chipTapAt(view, chip);
  if (tap === null) {
    return false;
  }
  event.preventDefault();
  onChipTap(tap);
  return true;
}

/**
 * Debounce before converting a completed typed reference into a chip —
 * long enough to stay out of the way between keystrokes, short enough that
 * the chip appears "as the user finishes typing".
 */
const CANONICALIZE_DEBOUNCE_MS = 150;

/** Does any selection range touch (or abut) the rewrite span? */
function selectionTouches(
  selection: EditorSelection,
  span: FormulaSpanRewrite
): boolean {
  return selection.ranges.some(
    (range) => range.from <= span.end && range.to >= span.start
  );
}

/**
 * `db("Name")` → `db("<id>")` rewrites, applying `canonicalizeExpression`'s
 * exact db rules (id matches kept, normalized name matches rewritten, first
 * database in list order on collisions) span-by-span so the caret filter can
 * skip a reference still being typed. Composed here from the lib's exported
 * primitives because `canonicalPropertyRewrites` is property-only; unlike
 * it, this is token-level (no parse gate) — db spans place chips token-level
 * too, so conversion stays aligned with what already renders as a chip even
 * while the surrounding draft is unparseable mid-keystroke.
 */
function canonicalDatabaseRewrites(
  source: string,
  databases: readonly FormulaRefDatabase[]
): FormulaSpanRewrite[] {
  if (databases.length === 0) {
    return [];
  }
  const ids = new Set(databases.map((database) => database.id));
  const idsByName = new Map<string, string>();
  for (const database of databases) {
    const key = normalizeFormulaPropertyName(database.name);
    if (!idsByName.has(key)) {
      idsByName.set(key, database.id);
    }
  }
  const rewrites: FormulaSpanRewrite[] = [];
  for (const span of formulaDbIdSpans(source)) {
    if (ids.has(span.id)) {
      continue;
    }
    const id = idsByName.get(normalizeFormulaPropertyName(span.id));
    if (id !== undefined) {
      rewrites.push({
        end: span.end,
        start: span.start,
        text: canonicalDatabaseReference(id),
      });
    }
  }
  return rewrites;
}

/**
 * Converts hand-typed display references (`thisPage.X`, name-form
 * `db("Name")` — and pasted name-form `prop("X")`) into canonical id-form
 * chips once complete, debounced, and ONLY for spans the caret/selection isn't touching —
 * a reference still being typed (caret inside or abutting it) is left alone,
 * so the conversion never fights the caret mid-word. Selection changes also
 * reschedule, so clicking away from a completed reference converts it.
 * The caret keeps its logical position: it's outside every rewritten span,
 * and CM maps it through the splices.
 */
const typedReferenceCanonicalizer = ViewPlugin.fromClass(
  class {
    private timer: number | null = null;
    private readonly view: EditorView;

    constructor(view: EditorView) {
      this.view = view;
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet) {
        this.schedule();
      }
    }

    destroy() {
      if (this.timer !== null) {
        clearTimeout(this.timer);
      }
    }

    private schedule() {
      if (this.timer !== null) {
        clearTimeout(this.timer);
      }
      this.timer = window.setTimeout(() => {
        this.timer = null;
        this.canonicalize();
      }, CANONICALIZE_DEBOUNCE_MS);
    }

    private canonicalize() {
      const { state } = this.view;
      const source = state.doc.toString();
      const rewrites = [
        ...canonicalPropertyRewrites(source, state.field(chipFields)),
        ...canonicalDatabaseRewrites(source, state.field(chipDatabases)),
      ].filter((rewrite) => !selectionTouches(state.selection, rewrite));
      if (rewrites.length === 0) {
        return;
      }
      this.view.dispatch({
        changes: rewrites.map((rewrite) => ({
          from: rewrite.start,
          to: rewrite.end,
          insert: rewrite.text,
        })),
      });
    }
  }
);

// --- diagnostics (squiggles) ---------------------------------------------------

/**
 * Debounce before re-checking the doc for squiggles — same cadence as the
 * typed-reference canonicalizer, so feedback settles as the user pauses
 * rather than flashing between keystrokes.
 */
const DIAGNOSTIC_DEBOUNCE_MS = 150;

const diagnosticMark = Decoration.mark({ class: "cm-formula-diagnostic" });

/** One squiggle extent; `start` inclusive, `end` exclusive. */
interface DiagnosticSpan {
  end: number;
  start: number;
}

/** Identifier/number run for sizing a parse-error underline. */
const TOKEN_TAIL_RE = /^[A-Za-z0-9_]+/;

/**
 * A parse error carries only a position: underline from there to the end of
 * the word it lands on, or one character — clamped inside the doc, so an
 * at-end-of-input error still underlines the last character.
 */
function parseErrorSpan(
  source: string,
  position: number
): DiagnosticSpan | null {
  if (source.length === 0) {
    return null;
  }
  const start = Math.min(position, source.length - 1);
  const tail = TOKEN_TAIL_RE.exec(source.slice(start));
  const end = Math.min(start + (tail?.[0].length ?? 1), source.length);
  return { end, start };
}

/** Squiggle extents for `source`: the parse error, else checker diagnostics. */
function rawDiagnosticSpans(
  source: string,
  context: FormulaCheckContext
): DiagnosticSpan[] {
  if (source.trim() === "") {
    return [];
  }
  const parsed = parseFormula(source);
  if (!parsed.ok) {
    const span = parseErrorSpan(source, parsed.error.position);
    return span === null ? [] : [span];
  }
  return checkFormula(parsed.ast, context).diagnostics.map(
    ({ end, start }) => ({ end, start })
  );
}

/**
 * A span that touches an atomic chip widens to cover the WHOLE chip — a
 * squiggle under three characters of hidden canonical text would render as a
 * fragment under the replacing widget. Overlapping results merge (they carry
 * one shared mark class) so the builder receives sorted, disjoint ranges.
 */
function clampSpansToChips(
  source: string,
  spans: readonly DiagnosticSpan[]
): DiagnosticSpan[] {
  const chips = referenceChipSpans(source);
  const widened = spans
    .map((span) => {
      let { end, start } = span;
      for (const chip of chips) {
        if (start < chip.end && end > chip.start) {
          start = Math.min(start, chip.start);
          end = Math.max(end, chip.end);
        }
      }
      return { end, start };
    })
    .sort((a, b) => a.start - b.start);
  const merged: DiagnosticSpan[] = [];
  for (const span of widened) {
    const last = merged.at(-1);
    if (last !== undefined && span.start <= last.end) {
      last.end = Math.max(last.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

/**
 * Diagnostics carried in editor state: the wavy underline marks, plus the
 * start offsets of chip spans a diagnostic touches. Chips get their
 * destructive ring from the WIDGET (via {@link PropertyChipWidget}) rather
 * than the mark — a mark that exactly covers an atomic replace widget opens
 * after it in CM's content order and renders nothing in real browsers.
 */
interface FormulaDiagnostics {
  decorations: DecorationSet;
  diagnosedChipStarts: ReadonlySet<number>;
}

const NO_DIAGNOSTICS: FormulaDiagnostics = {
  decorations: Decoration.none,
  diagnosedChipStarts: new Set(),
};

function buildDiagnostics(state: EditorState): FormulaDiagnostics {
  const source = state.doc.toString();
  const raw = rawDiagnosticSpans(source, state.field(checkContextState));
  const diagnosedChipStarts = new Set<number>();
  for (const chip of referenceChipSpans(source)) {
    if (raw.some((span) => span.start < chip.end && span.end > chip.start)) {
      diagnosedChipStarts.add(chip.start);
    }
  }
  const builder = new RangeSetBuilder<Decoration>();
  for (const span of clampSpansToChips(source, raw)) {
    if (span.start < span.end) {
      builder.add(span.start, span.end, diagnosticMark);
    }
  }
  return { decorations: builder.finish(), diagnosedChipStarts };
}

/** Replaced wholesale by {@link diagnosticsScheduler} after each debounce. */
const setDiagnostics = StateEffect.define<FormulaDiagnostics>();

/**
 * Diagnostics live in a state field (not the scheduling plugin) so they MAP
 * through edits between checks — a stale underline drifts with the text
 * instead of pointing at the wrong characters until the next pass.
 */
const diagnosticsField = StateField.define<FormulaDiagnostics>({
  create: () => NO_DIAGNOSTICS,
  update(value, transaction) {
    let next = value;
    if (transaction.docChanged) {
      const mapped = new Set<number>();
      for (const start of value.diagnosedChipStarts) {
        mapped.add(transaction.changes.mapPos(start, 1));
      }
      next = {
        decorations: value.decorations.map(transaction.changes),
        diagnosedChipStarts: mapped,
      };
    }
    for (const effect of transaction.effects) {
      if (effect.is(setDiagnostics)) {
        next = effect.value;
      }
    }
    return next;
  },
  provide: (field) =>
    EditorView.decorations.from(field, (value) => value.decorations),
});

/**
 * Debounced parse+check driving {@link diagnosticsField}: reschedules on doc
 * changes and check-context swaps (a schema edit can change what's valid),
 * and runs once at startup so an existing broken expression squiggles on
 * open. The dispatched effect doesn't reschedule (no doc/context change), so
 * the cycle terminates.
 */
const diagnosticsScheduler = ViewPlugin.fromClass(
  class {
    private timer: number | null = null;
    private readonly view: EditorView;

    constructor(view: EditorView) {
      this.view = view;
      this.schedule();
    }

    update(update: ViewUpdate) {
      const contextChanged =
        update.startState.field(checkContextState) !==
        update.state.field(checkContextState);
      if (update.docChanged || contextChanged) {
        this.schedule();
      }
    }

    destroy() {
      if (this.timer !== null) {
        clearTimeout(this.timer);
      }
    }

    private schedule() {
      if (this.timer !== null) {
        clearTimeout(this.timer);
      }
      this.timer = window.setTimeout(() => {
        this.timer = null;
        this.view.dispatch({
          effects: setDiagnostics.of(buildDiagnostics(this.view.state)),
        });
      }, DIAGNOSTIC_DEBOUNCE_MS);
    }
  }
);

// --- argument info card --------------------------------------------------------

/**
 * The info card's DOM (no React inside CM): the signature with the parameter
 * at `activeIndex` emphasized, then the one-line description. A variadic
 * tail stays highlighted for every argument it governs; an index past a
 * non-variadic signature highlights nothing (the arity error is the status
 * row's job).
 */
function infoCardDom(
  entry: FormulaFunctionEntry,
  activeIndex: number
): HTMLElement {
  const highlighted =
    formulaParamAt(entry, activeIndex) === undefined
      ? -1
      : Math.min(activeIndex, entry.params.length - 1);
  const card = document.createElement("div");
  card.className = "cm-formula-infocard";
  const signature = document.createElement("div");
  signature.className = "cm-formula-infocard-signature";
  signature.append(`${entry.name}(`);
  entry.params.forEach((param, index) => {
    if (index > 0) {
      signature.append(", ");
    }
    const label = document.createElement("span");
    if (index === highlighted) {
      label.className = "cm-formula-infocard-active";
    }
    label.textContent = formulaParamLabel(param);
    signature.append(label);
  });
  signature.append(")");
  const description = document.createElement("div");
  description.className = "cm-formula-infocard-description";
  description.textContent = entry.description;
  card.append(signature, description);
  return card;
}

/**
 * The tooltip spec while the caret sits inside a known call's argument list:
 * anchored at the CALLEE's start (origin-anchored per proposal §6), above
 * the line. Dot-chained method calls offset the parameter index by one —
 * the receiver occupies param 0. `null` (hidden) while the completion popup
 * is open/pending (the two would stack), for unknown callees, and at the
 * top level.
 */
function functionInfoTooltip(state: EditorState): Tooltip | null {
  if (completionStatus(state) !== null) {
    return null;
  }
  const range = state.selection.main;
  if (!range.empty) {
    return null;
  }
  const call = formulaEnclosingCallAt(state.doc.toString(), range.head);
  if (call === null) {
    return null;
  }
  const entry = formulaFunctionForName(call.name);
  if (entry === undefined) {
    return null;
  }
  const argIndex = call.argIndex + (call.method ? 1 : 0);
  return {
    above: true,
    create: () => ({ dom: infoCardDom(entry, argIndex) }),
    pos: call.position,
  };
}

/**
 * Origin-anchored argument info card (proposal §6). Recomputed per
 * transaction — the inputs (caret, doc, completion status) all change
 * through transactions, and the scan is one linear tokenize like the
 * highlighter's.
 */
const functionInfoCard = StateField.define<Tooltip | null>({
  create: functionInfoTooltip,
  update: (_value, transaction) => functionInfoTooltip(transaction.state),
  provide: (field) => showTooltip.from(field),
});

// --- argument placeholders -----------------------------------------------------

/**
 * One live placeholder: the span its label currently occupies. The label is
 * stored so mapping can tell "the span drifted with an edit elsewhere"
 * (text still equals the label — keep) from "the user typed over it"
 * (text diverged — drop).
 */
interface ArgumentPlaceholder {
  /** Span start (inclusive) in the doc. */
  from: number;
  /** The param label the span was inserted as (`date`, `digits?`, `…`). */
  label: string;
  /** Span end (exclusive) in the doc. */
  to: number;
}

/** Registers freshly inserted placeholders (positions in the NEW doc). */
const addPlaceholders = StateEffect.define<readonly ArgumentPlaceholder[]>();

/** Drops every placeholder — the pre-submit sweep (Mod+Enter). */
const clearPlaceholders = StateEffect.define<null>();

/**
 * Map placeholders through a doc change, dropping any whose text no longer
 * equals its label. Start maps with assoc 1 and end with assoc -1 so an
 * insertion at either boundary stays OUTSIDE the span; typing over the
 * selected placeholder collapses/diverges its span, which the label-equality
 * check turns into removal.
 */
function mapPlaceholders(
  value: readonly ArgumentPlaceholder[],
  transaction: Transaction
): ArgumentPlaceholder[] {
  const mapped: ArgumentPlaceholder[] = [];
  for (const range of value) {
    const from = transaction.changes.mapPos(range.from, 1);
    const to = transaction.changes.mapPos(range.to, -1);
    if (from < to && transaction.newDoc.sliceString(from, to) === range.label) {
      mapped.push({ from, label: range.label, to });
    }
  }
  return mapped;
}

const placeholderMark = Decoration.mark({ class: "cm-formula-placeholder" });

/** The pill marks for the current placeholder set (kept sorted by start). */
function placeholderDecorations(
  ranges: readonly ArgumentPlaceholder[]
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const range of ranges) {
    builder.add(range.from, range.to, placeholderMark);
  }
  return builder.finish();
}

/**
 * The live placeholder set (see the ARGUMENT PLACEHOLDERS module docs):
 * spans map through every edit and self-remove once their text diverges
 * from the label, so the pills are pure styling over honest doc text —
 * a saved formula can only ever contain the literal text.
 */
const placeholderField = StateField.define<readonly ArgumentPlaceholder[]>({
  create: () => [],
  update(value, transaction) {
    let next = transaction.docChanged
      ? mapPlaceholders(value, transaction)
      : value;
    for (const effect of transaction.effects) {
      if (effect.is(addPlaceholders)) {
        next = [...next, ...effect.value].sort((a, b) => a.from - b.from);
      } else if (effect.is(clearPlaceholders)) {
        next = [];
      }
    }
    return next;
  },
  provide: (field) =>
    EditorView.decorations.from(field, placeholderDecorations),
});

/**
 * Splice the snippet form `name(label1, label2)` over `range`, register a
 * placeholder over each label, and select the FIRST placeholder so typing
 * replaces it. Zero labels insert `name()` with the caret after the parens
 * (the zero-argument completion convention). Shared by the autocomplete
 * apply and the handle's `insertSnippet`.
 */
function insertSnippetAt(
  view: EditorView,
  range: { from: number; to: number },
  name: string,
  labels: readonly string[]
): void {
  const insert = `${name}(${labels.join(", ")})`;
  const ranges: ArgumentPlaceholder[] = [];
  let cursor = range.from + name.length + 1;
  for (const label of labels) {
    ranges.push({ from: cursor, label, to: cursor + label.length });
    cursor += label.length + 2; // past the ", " separator
  }
  const first = ranges[0];
  view.dispatch({
    changes: { from: range.from, insert, to: range.to },
    effects: addPlaceholders.of(ranges),
    selection:
      first === undefined
        ? { anchor: range.from + insert.length }
        : { anchor: first.from, head: first.to },
    userEvent: "input.complete",
  });
}

/**
 * Tab: select the next placeholder at or past the selection. Declines (Tab
 * falls through — accept-completion runs earlier in the keymap, focus moves
 * on) when no placeholder remains ahead.
 */
function selectNextPlaceholder(view: EditorView): boolean {
  const { main } = view.state.selection;
  // `from >= main.to` naturally skips the currently selected placeholder
  // (its start precedes its own end) while catching a caret sitting at a
  // placeholder's left edge.
  const next = view.state
    .field(placeholderField)
    .find((range) => range.from >= main.to);
  if (next === undefined) {
    return false;
  }
  view.dispatch({
    scrollIntoView: true,
    selection: { anchor: next.from, head: next.to },
  });
  return true;
}

/** Shift-Tab: select the previous placeholder before the selection. */
function selectPreviousPlaceholder(view: EditorView): boolean {
  const { main } = view.state.selection;
  // The set is kept sorted by start, so the last match wins (no findLast in
  // the compile target's lib).
  let previous: ArgumentPlaceholder | undefined;
  for (const range of view.state.field(placeholderField)) {
    if (range.to <= main.from) {
      previous = range;
    }
  }
  if (previous === undefined) {
    return false;
  }
  view.dispatch({
    scrollIntoView: true,
    selection: { anchor: previous.from, head: previous.to },
  });
  return true;
}

/**
 * Press on a placeholder pill: select its WHOLE span so typing replaces it
 * (the touch affordance — no caret gymnastics). Mirrors the chip press
 * interception, but selecting rather than menuing; off-pill presses fall
 * through to CM untouched.
 */
function selectPlaceholderPress(event: MouseEvent, view: EditorView): boolean {
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  const pill = target.closest(".cm-formula-placeholder");
  if (!(pill instanceof HTMLElement)) {
    return false;
  }
  const pos = view.posAtDOM(pill, 0);
  const range = view.state
    .field(placeholderField)
    .find((candidate) => candidate.from <= pos && pos <= candidate.to);
  if (range === undefined) {
    return false;
  }
  event.preventDefault();
  view.dispatch({ selection: { anchor: range.from, head: range.to } });
  view.focus();
  return true;
}

// --- fused autocomplete ------------------------------------------------------

/** Identifier being typed at the caret (completion trigger + filter range). */
const IDENTIFIER_TAIL_RE = /[A-Za-z_][A-Za-z0-9_]*$/;

/** Keep the open popup filtering while identifier characters are typed. */
const IDENTIFIER_VALID_FOR_RE = /^[A-Za-z0-9_]*$/;

/**
 * A scope-root reference prefix (`thisPage.` / `thisRow.`, any casing)
 * directly before a position: completions triggered there narrow to
 * properties and replace the WHOLE reference with one canonical chip.
 */
const SCOPE_PREFIX_RE = new RegExp(
  `(?:${[...FORMULA_SCOPE_ROOTS].join("|")})\\s*\\.\\s*$`,
  "i"
);

/** Start of the scope-root prefix ending at `prefix`'s end, else its length. */
function scopePrefixStart(prefix: string): number {
  const match = SCOPE_PREFIX_RE.exec(prefix);
  return match === null ? prefix.length : match.index;
}

/**
 * Per-schema property VALUE types (formula fields typed via the same
 * topological pass the checker uses), memoized on the `fields` identity —
 * the completion source runs per keystroke, the schema changes rarely.
 */
const fieldValueTypesCache = new WeakMap<
  readonly DatabaseField[],
  ReadonlyMap<string, FormulaType>
>();

function fieldValueTypes(
  fields: readonly DatabaseField[]
): ReadonlyMap<string, FormulaType> {
  let types = fieldValueTypesCache.get(fields);
  if (types === undefined) {
    const map = new Map<string, FormulaType>();
    for (const property of formulaCheckContext(fields).properties) {
      map.set(property.id, formulaPropertyValueType(property));
    }
    types = map;
    fieldValueTypesCache.set(fields, types);
  }
  return types;
}

/**
 * The declared type of the argument position at `position`, when the
 * innermost unclosed call resolves to a catalog signature — the "fused"
 * ranking signal. Dot-chained method calls offset the parameter index by
 * one (the receiver occupies param 0). `null` when unknowable or unhelpful
 * (unknown/typevar params accept everything; lambda params never match a
 * value candidate).
 */
function expectedArgumentType(
  source: string,
  position: number
): FormulaType | null {
  const call = formulaEnclosingCallAt(source, position);
  if (call === null) {
    return null;
  }
  const entry = formulaFunctionForName(call.name);
  const argIndex = call.argIndex + (call.method ? 1 : 0);
  const param =
    entry === undefined ? undefined : formulaParamAt(entry, argIndex);
  if (param === undefined) {
    return null;
  }
  const { type } = param;
  const unhelpful =
    type.kind === "unknown" ||
    type.kind === "typevar" ||
    type.kind === "lambda";
  return unhelpful ? null : type;
}

/**
 * Ranking weights. CM adds `boost` raw to the fuzzy-match score, whose
 * quality tiers step by 100+ (case fold −200, non-start −700…) and vary by
 * label length within a tier — so these sit well above label-length noise
 * (dominating ties) while staying inside the documented −99..99 range, below
 * a full quality tier: a genuinely better textual match still wins.
 */
const TYPE_MATCH_BOOST = 50;
const PROPERTY_BASE_BOOST = 10;
const KEYWORD_BASE_BOOST = -10;

/**
 * Boost for a candidate whose result type fits the expected argument type.
 * Only CONCRETE results count — `unknown` fits everywhere by the checker's
 * optimism, and boosting everything is boosting nothing.
 */
function typeMatchBoost(
  result: FormulaType,
  expected: FormulaType | null
): number {
  if (expected === null) {
    return 0;
  }
  const concrete =
    result.kind !== "unknown" &&
    result.kind !== "typevar" &&
    result.kind !== "error";
  return concrete && formulaTypeFits(result, expected) ? TYPE_MATCH_BOOST : 0;
}

/** Field behind a property completion, for the icon-slot renderer. */
const completionFields = new WeakMap<Completion, DatabaseField>();

/**
 * The leading icon of each completion row (replaces CM's built-in icon
 * classes): the field-type/custom icon for properties, the database glyph
 * for database options, a function glyph for functions, an empty spacer for
 * keywords so columns stay aligned.
 */
function renderCompletionIcon(completion: Completion): Node {
  const holder = document.createElement("span");
  holder.className = "cm-formula-completion-icon";
  holder.setAttribute("aria-hidden", "true");
  const field = completionFields.get(completion);
  if (field !== undefined) {
    holder.append(chipIcon(field));
  } else if (completion.type === "database") {
    holder.append(tablerIconSvg(DATABASE_CHIP_ICON_NODE));
  } else if (completion.type === "function") {
    holder.textContent = "ƒ";
  }
  return holder;
}

/** Splice `insert` over `[from, to)`, caret at `caret`, as a completion. */
function applyInsert(
  view: EditorView,
  range: { from: number; to: number },
  insert: string,
  caret: number
): void {
  view.dispatch({
    changes: { from: range.from, insert, to: range.to },
    selection: { anchor: caret },
    userEvent: "input.complete",
  });
}

/**
 * A property option: labeled/filtered by the field NAME, applied as the
 * canonical `prop("<id>")` text (which renders as one atomic chip), detail
 * showing the field's value type. Any typed scope-root prefix
 * (`thisPage.Pri`) is replaced along with the partial name.
 */
function propertyCompletion(
  field: DatabaseField,
  valueType: FormulaType,
  expected: FormulaType | null
): Completion {
  const completion: Completion = {
    apply: (view, _completion, from, to) => {
      const start = scopePrefixStart(view.state.sliceDoc(0, from));
      const insert = canonicalPropertyReference(field.id);
      applyInsert(view, { from: start, to }, insert, start + insert.length);
    },
    boost: PROPERTY_BASE_BOOST + typeMatchBoost(valueType, expected),
    detail: formulaTypeBadge(valueType),
    label: field.name,
    type: "property",
  };
  completionFields.set(completion, field);
  return completion;
}

/**
 * A catalog-function option: signature as detail, description as the info
 * card, applied as the argument-placeholder snippet form with the first
 * placeholder selected ({@link insertSnippetAt}); zero-argument functions
 * (`now()`/`today()`) keep the plain `name()` insert with the caret after
 * the parens.
 */
function functionCompletion(
  entry: FormulaFunctionEntry,
  expected: FormulaType | null
): Completion {
  return {
    apply: (view, _completion, from, to) => {
      insertSnippetAt(
        view,
        { from, to },
        entry.name,
        entry.params.map(formulaParamLabel)
      );
    },
    boost: typeMatchBoost(entry.returns, expected),
    detail: formulaFunctionSignature(entry).slice(entry.name.length),
    info: entry.description,
    label: entry.name,
    type: "function",
  };
}

/**
 * A user-defined function option: same treatment as a catalog function —
 * signature detail, the description as the info card, applied as the
 * argument-placeholder snippet form (`weightedScore(points, weight)` with
 * the first placeholder selected). No type boost: the body's result type
 * depends on the call's argument types, so there's no static result to rank
 * by.
 */
function userFunctionCompletion(def: FormulaPreparedUserFunction): Completion {
  return {
    apply: (view, _completion, from, to) => {
      insertSnippetAt(view, { from, to }, def.name, def.params);
    },
    detail: formulaUserFunctionSignature(def).slice(def.name.length),
    ...(def.description === undefined ? {} : { info: def.description }),
    label: def.name,
    type: "function",
  };
}

/**
 * The word operators/keywords that read naturally as completions. All five
 * head boolean expressions, so a boolean argument position boosts them.
 */
const KEYWORD_LABELS = ["and", "or", "not", "true", "false"] as const;

/**
 * Catalog functions whose keyword row already covers them: `and`/`or`/`not`
 * read as operators, so offering `and(…)` beside the `and` keyword is a
 * duplicate. The panel's reference list still documents the function forms.
 */
const KEYWORD_FUNCTION_NAMES: ReadonlySet<string> = new Set([
  "and",
  "or",
  "not",
]);

function keywordCompletions(expected: FormulaType | null): Completion[] {
  return KEYWORD_LABELS.map((label) => ({
    boost: KEYWORD_BASE_BOOST + typeMatchBoost(BOOLEAN_TYPE, expected),
    label,
    type: "keyword",
  }));
}

/** Display casing for {@link FORMULA_SCOPE_ROOTS} (grammar is case-blind). */
const SCOPE_ROOT_LABELS = ["thisPage", "thisRow"] as const;

/**
 * Scope-root references complete too — typing `thi…` lands on `thisPage.`
 * — and accepting one immediately reopens the popup, which the trailing
 * dot puts in property-only mode, so the property pick (which replaces the
 * whole reference with one canonical chip) is a keystroke away.
 */
function scopeRootCompletions(): Completion[] {
  return SCOPE_ROOT_LABELS.map((label) => ({
    apply: (
      view: EditorView,
      _completion: Completion,
      from: number,
      to: number
    ) => {
      const insert = `${label}.`;
      applyInsert(view, { from, to }, insert, from + insert.length);
      startCompletion(view);
    },
    boost: KEYWORD_BASE_BOOST,
    detail: "reference",
    info: "This row's properties — picking one inserts its reference.",
    label,
    type: "keyword",
  }));
}

/**
 * A `db` reference completes like a scope root: accepting inserts the
 * opener `db("` and immediately reopens the popup, which the db-argument
 * position ({@link dbArgumentQueryAt}) fills with database names — the
 * canonical pick is a keystroke away. Offered only when the host supplied
 * databases; without them the flow would strand the user in an
 * unterminated string.
 */
function dbRootCompletion(): Completion {
  return {
    apply: (
      view: EditorView,
      _completion: Completion,
      from: number,
      to: number
    ) => {
      const insert = 'db("';
      applyInsert(view, { from, to }, insert, from + insert.length);
      startCompletion(view);
    },
    boost: KEYWORD_BASE_BOOST,
    detail: "reference",
    info: "A whole database's rows — picking one inserts its reference.",
    label: "db",
    type: "keyword",
  };
}

/**
 * Matches a `db("` opener directly before a position with the (partial)
 * argument text after it — the caret sits in a db reference's string
 * argument. Anchored to the position, so an already-closed string earlier
 * in the doc can't match.
 */
const DB_ARGUMENT_PREFIX_RE = /\bdb\s*\(\s*"([^"\\]*)$/i;

/**
 * Keep the db-name popup open across any argument input — database names
 * may contain spaces, so the identifier rule would close it mid-name.
 */
const DB_ARGUMENT_VALID_FOR_RE = /^[^"\\]*$/;

/** The db-argument position at `position`, if the caret sits in one. */
function dbArgumentQueryAt(
  source: string,
  position: number
): { query: string; refStart: number } | null {
  const match = DB_ARGUMENT_PREFIX_RE.exec(source.slice(0, position));
  if (match === null) {
    return null;
  }
  return { query: match[1], refStart: match.index };
}

/**
 * End (exclusive) of the db reference being completed at `position`: the
 * whole span when the reference is already complete (caret mid-argument in
 * `db("Ta|sks")`), else the caret itself (`db("Ta` still being typed) —
 * the apply replaces the entire reference either way.
 */
function dbReferenceEnd(source: string, position: number): number {
  const span = formulaDbIdSpans(source).find(
    (candidate) => candidate.start < position && position <= candidate.end
  );
  return span?.end ?? position;
}

/**
 * One database-name option inside `db("`: labeled/filtered by the database
 * NAME, applied as the whole canonical `db("<id>")` reference (one atomic
 * chip) with the caret after it — the typed opener and any argument
 * remnant are consumed. The reference extent is re-resolved from the LIVE
 * state at apply time (same staleness rule as {@link chipTapAt}).
 */
function databaseCompletion(database: FormulaRefDatabase): Completion {
  return {
    apply: (view) => {
      const doc = view.state.doc.toString();
      const head = view.state.selection.main.head;
      const argument = dbArgumentQueryAt(doc, head);
      if (argument === null) {
        return;
      }
      const insert = canonicalDatabaseReference(database.id);
      applyInsert(
        view,
        { from: argument.refStart, to: dbReferenceEnd(doc, head) },
        insert,
        argument.refStart + insert.length
      );
    },
    detail: "database",
    label: database.name,
    type: "database",
  };
}

/**
 * Completions while the caret sits inside a `db("` argument: database
 * names, filtered from the argument's start. Names may contain spaces, so
 * `validFor` keeps the open popup filtering on any non-quote input instead
 * of the identifier rule. `null` outside a db argument (or with no
 * databases to offer — an empty popup would just block the string).
 */
function dbArgumentCompletions(
  context: CompletionContext,
  doc: string
): CompletionResult | null {
  const argument = dbArgumentQueryAt(doc, context.pos);
  if (argument === null) {
    return null;
  }
  const databases = context.state.field(chipDatabases);
  if (databases.length === 0) {
    return null;
  }
  return {
    from: context.pos - argument.query.length,
    options: databases.map(databaseCompletion),
    validFor: DB_ARGUMENT_VALID_FOR_RE,
  };
}

/** Is `position` inside a string or comment (no completions there)? */
function insideStringOrComment(source: string, position: number): boolean {
  return highlightFormula(source).some(
    (span) =>
      (span.kind === "string" || span.kind === "comment") &&
      span.start < position &&
      position <= span.end
  );
}

/**
 * The single fused completion source: properties + functions + keywords in
 * one ranked list (CM's default fuzzy filter handles case-insensitive
 * prefix/word-boundary matching; `boost` layers the type-aware ranking on
 * top). Triggers on a typed identifier, right after a scope-root dot
 * (properties only there), or explicitly via Ctrl+Space.
 */
function formulaCompletionSource(
  context: CompletionContext
): CompletionResult | null {
  const doc = context.state.doc.toString();
  // The db-argument position sits INSIDE a string literal, which the
  // insideStringOrComment gate below would suppress — carve it out first,
  // deliberately: database names complete there and nowhere else inside
  // strings.
  const dbArgument = dbArgumentCompletions(context, doc);
  if (dbArgument !== null) {
    return dbArgument;
  }
  const word = context.matchBefore(IDENTIFIER_TAIL_RE);
  const from = word?.from ?? context.pos;
  const scopeStart = scopePrefixStart(doc.slice(0, from));
  const propertyOnly = scopeStart < from;
  if (word === null && !(context.explicit || propertyOnly)) {
    return null;
  }
  if (insideStringOrComment(doc, context.pos)) {
    return null;
  }
  const fields = context.state.field(chipFields);
  const valueTypes = fieldValueTypes(fields);
  const expected = expectedArgumentType(doc, scopeStart);
  const options: Completion[] = fields.map((field) =>
    propertyCompletion(
      field,
      valueTypes.get(field.id) ?? UNKNOWN_TYPE,
      expected
    )
  );
  if (!propertyOnly) {
    for (const entry of FORMULA_FUNCTION_CATALOG) {
      if (!KEYWORD_FUNCTION_NAMES.has(entry.name)) {
        options.push(functionCompletion(entry, expected));
      }
    }
    // User-defined functions ride the live check context (the panel's
    // memoized `formulaCheckContext(fields, related, userFunctions)`), so a
    // definition created while the editor is open completes immediately.
    const userFunctions = context.state.field(checkContextState).userFunctions;
    if (userFunctions !== undefined) {
      for (const def of userFunctions.values()) {
        options.push(userFunctionCompletion(def));
      }
    }
    options.push(...keywordCompletions(expected), ...scopeRootCompletions());
    if (context.state.field(chipDatabases).length > 0) {
      options.push(dbRootCompletion());
    }
  }
  return { from, options, validFor: IDENTIFIER_VALID_FOR_RE };
}

/**
 * Keeps menu typeahead/arrow handling away from the editor (the panel lives
 * inside a Base UI menu popup): every key except Escape stops propagating.
 * Escape stops propagating ONLY while the completion popup is open/pending —
 * the completion keymap (which runs after this handler) closes the popup and
 * the enclosing menu stays open; with no popup, Escape bubbles so the menu
 * closes (the original contract). Registered at the highest precedence,
 * ahead of the completion keymap, so it observes the popup state BEFORE the
 * close is dispatched. Returning false lets CM handle the key.
 */
function menuKeydownGuard(event: KeyboardEvent, view: EditorView): boolean {
  if (event.key !== "Escape" || completionStatus(view.state) !== null) {
    event.stopPropagation();
  }
  return false;
}

/**
 * Editor chrome + the restrained token palette from the v2 proposal §6:
 * functions/operators in plain foreground, literals in muted block colors,
 * references blue, bound names purple, comments muted-italic. All colors are
 * theme CSS variables so light/dark track the app automatically. Fonts and
 * text size inherit from the container's `font-mono text-xs`.
 */
const formulaEditorTheme = EditorView.theme({
  "&": { backgroundColor: "transparent", fontSize: "inherit" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "1.5",
    maxHeight: "8rem",
    overflow: "auto",
  },
  ".cm-content": {
    caretColor: "var(--color-foreground)",
    minHeight: "4rem",
    padding: "8px 10px",
  },
  ".cm-line": { padding: "0" },
  ".cm-placeholder": { color: "var(--color-muted-foreground)" },
  "&.cm-focused .cm-matchingBracket": {
    backgroundColor: "var(--color-muted)",
  },
  "&.cm-focused .cm-nonmatchingBracket": {
    backgroundColor: "transparent",
    textDecoration: "underline wavy var(--color-destructive)",
  },
  // Completion popup (parented to document.body — CM mirrors the editor's
  // theme classes onto the external container, so these rules still apply).
  // Popover look via theme variables; above the Base UI menu popup's z-50.
  ".cm-tooltip": {
    backgroundColor: "var(--color-popover)",
    border: "1px solid var(--color-border)",
    borderRadius: "0.5rem",
    color: "var(--color-popover-foreground)",
    zIndex: "60",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    fontFamily: "var(--font-sans)",
    fontSize: "0.75rem",
    maxHeight: "13.5rem",
    minWidth: "12rem",
    padding: "4px",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
    alignItems: "center",
    borderRadius: "0.375rem",
    display: "flex",
    gap: "6px",
    lineHeight: "1.5",
    padding: "3px 6px",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--color-accent)",
    color: "var(--color-accent-foreground)",
  },
  ".cm-formula-completion-icon": {
    color: "var(--color-muted-foreground)",
    display: "inline-flex",
    flexShrink: "0",
    justifyContent: "center",
    width: "1rem",
  },
  ".cm-completionLabel": { flexShrink: "0" },
  ".cm-completionMatchedText": {
    fontWeight: "600",
    textDecoration: "none",
  },
  ".cm-completionDetail": {
    color: "var(--color-muted-foreground)",
    fontFamily: "var(--font-mono)",
    fontStyle: "normal",
    marginLeft: "auto",
    overflow: "hidden",
    paddingLeft: "0.5rem",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ".cm-tooltip.cm-completionInfo": {
    color: "var(--color-muted-foreground)",
    fontFamily: "var(--font-sans)",
    fontSize: "0.75rem",
    maxWidth: "16rem",
    padding: "6px 8px",
  },
  // Argument placeholder pills: muted, dashed — deliberately quieter than
  // the blue property chips and unlike the destructive squiggles, since a
  // placeholder is an invitation, not an error. Tapping one selects it.
  ".cm-formula-placeholder": {
    backgroundColor: "var(--color-muted)",
    border: "1px dashed var(--color-border)",
    borderRadius: "0.25rem",
    color: "var(--color-muted-foreground)",
    cursor: "pointer",
    padding: "0 3px",
  },
  // Squiggles: destructive wavy underline; a diagnosed atomic chip gets a
  // destructive ring instead (an underline under a bg-filled chip is mud).
  ".cm-formula-diagnostic": {
    textDecoration: "underline wavy var(--color-destructive)",
    textDecorationSkipInk: "none",
  },
  ".cm-formula-chip-diagnosed": {
    boxShadow: "inset 0 0 0 1px var(--color-destructive)",
  },
  // Argument info card (origin-anchored tooltip; wrapper look comes from the
  // shared .cm-tooltip popover rules above).
  ".cm-formula-infocard": {
    display: "flex",
    flexDirection: "column",
    fontFamily: "var(--font-sans)",
    fontSize: "0.75rem",
    gap: "2px",
    maxWidth: "18rem",
    padding: "6px 8px",
  },
  ".cm-formula-infocard-signature": {
    color: "var(--color-foreground)",
    fontFamily: "var(--font-mono)",
  },
  ".cm-formula-infocard-active": {
    fontWeight: "600",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
  },
  ".cm-formula-infocard-description": {
    color: "var(--color-muted-foreground)",
  },
  ".cm-formula-comment": {
    color: "var(--color-muted-foreground)",
    fontStyle: "italic",
  },
  ".cm-formula-function": { color: "var(--color-foreground)" },
  ".cm-formula-literal": { color: "var(--block-text-orange)" },
  ".cm-formula-name": { color: "var(--block-text-purple)" },
  ".cm-formula-number": { color: "var(--block-text-orange)" },
  ".cm-formula-operator": { color: "var(--color-foreground)" },
  ".cm-formula-property": { color: "var(--block-text-blue)" },
  ".cm-formula-string": { color: "var(--block-text-green)" },
});

/** Latest-callback cell so the mount-once extensions never go stale. */
interface EditorCallbacks {
  onChange: (value: string) => void;
  onChipTap?: (tap: FormulaChipTap) => void;
  onSubmit?: () => void;
}

/**
 * Stable stand-in for an omitted `databases` prop, so the push-effect's
 * dependency never flips identity between renders.
 */
const NO_DATABASES: readonly FormulaRefDatabase[] = [];

/** The CM6 formula editor (see module docs). */
export function FormulaCodeEditor({
  ariaLabel,
  autoFocus = false,
  checkContext,
  className,
  databases = NO_DATABASES,
  editorRef,
  fields,
  onChange,
  onChipTap,
  onSubmit,
  placeholder,
  value,
}: FormulaCodeEditorProps): ReactNode {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const callbacksRef = useRef<EditorCallbacks>({
    onChange,
    onChipTap,
    onSubmit,
  });
  /**
   * Doc text the React side last saw — written by the update listener before
   * `onChange` so the controlled-sync effect skips redundant dispatches, and
   * read at (re)create time so a mount uses the freshest value.
   */
  const valueRef = useRef(value);
  /** Latest schema, read at (re)create time to seed the chip state field. */
  const fieldsRef = useRef(fields);
  /** Latest databases, read at (re)create time to seed the db-chip field. */
  const databasesRef = useRef(databases);
  /** Latest check context, read at (re)create time to seed its state field. */
  const checkContextRef = useRef(checkContext);

  useEffect(() => {
    callbacksRef.current = { onChange, onChipTap, onSubmit };
  }, [onChange, onChipTap, onSubmit]);

  // Push schema changes into editor state so open chips relabel live.
  useEffect(() => {
    fieldsRef.current = fields;
    viewRef.current?.dispatch({ effects: setChipFields.of(fields) });
  }, [fields]);

  // Push database-list changes in so open db chips relabel live too.
  useEffect(() => {
    databasesRef.current = databases;
    viewRef.current?.dispatch({ effects: setChipDatabases.of(databases) });
  }, [databases]);

  // Push check-context changes in so squiggles track the live schema.
  useEffect(() => {
    checkContextRef.current = checkContext;
    viewRef.current?.dispatch({ effects: setCheckContext.of(checkContext) });
  }, [checkContext]);

  // Create the view. ariaLabel/placeholder are mount-time settings (constant
  // in practice); changing one recreates the view rather than going stale.
  useEffect(() => {
    const parent = containerRef.current;
    if (parent === null) {
      return;
    }
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: valueRef.current,
        // Caret starts at the end so reference-list inserts append rather
        // than prepend before the user has clicked into the text.
        selection: { anchor: valueRef.current.length },
        extensions: [
          // First + highest precedence: must observe the completion popup
          // state before the completion keymap (also Prec.highest) closes it.
          Prec.highest(
            EditorView.domEventHandlers({ keydown: menuKeydownGuard })
          ),
          // Chip tap → option menu (see module docs): both handlers no-op
          // unless the host wired onChipTap, so default caret behavior on and
          // around chips is untouched otherwise.
          EditorView.domEventHandlers({
            click: (event, view) =>
              emitChipTap(event, view, callbacksRef.current.onChipTap),
            // Chip suppression first (its menu owns the press), then the
            // placeholder pill press (select the whole span).
            mousedown: (event, view) =>
              suppressChipPress(
                event,
                callbacksRef.current.onChipTap !== undefined
              ) || selectPlaceholderPress(event, view),
          }),
          keymap.of([
            {
              key: "Mod-Enter",
              run: (view) => {
                // Placeholders are a transient authoring aid: sweep them
                // before submitting so none outlives a save attempt.
                if (view.state.field(placeholderField).length > 0) {
                  view.dispatch({ effects: clearPlaceholders.of(null) });
                }
                callbacksRef.current.onSubmit?.();
                return true;
              },
            },
            // Tab accepts like Enter while the popup is open, then jumps to
            // the next argument placeholder; with neither, both decline and
            // Tab keeps moving focus. Shift-Tab walks placeholders back.
            { key: "Tab", run: acceptCompletion },
            { key: "Tab", run: selectNextPlaceholder },
            { key: "Shift-Tab", run: selectPreviousPlaceholder },
            ...historyKeymap,
            ...defaultKeymap,
          ]),
          history(),
          EditorView.lineWrapping,
          bracketMatching(),
          placeholderOf(placeholder ?? ""),
          EditorView.contentAttributes.of({
            "aria-label": ariaLabel,
            autocapitalize: "off",
            autocorrect: "off",
            spellcheck: "false",
          }),
          autocompletion({
            activateOnTyping: true,
            addToOptions: [{ position: 20, render: renderCompletionIcon }],
            icons: false,
            override: [formulaCompletionSource],
          }),
          // Fixed positioning off document.body: the Base UI menu popup the
          // panel lives in must not clip or transform-offset the popup.
          tooltips({ parent: document.body, position: "fixed" }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) {
              return;
            }
            // Skip the echo when the change IS the controlled sync (the
            // sync effect writes valueRef before dispatching).
            const next = update.state.doc.toString();
            if (next !== valueRef.current) {
              valueRef.current = next;
              callbacksRef.current.onChange(next);
            }
          }),
          formulaHighlighter,
          chipFields.init(() => fieldsRef.current),
          chipDatabases.init(() => databasesRef.current),
          checkContextState.init(() => checkContextRef.current),
          referenceChips,
          placeholderField,
          typedReferenceCanonicalizer,
          diagnosticsField,
          diagnosticsScheduler,
          functionInfoCard,
          formulaEditorTheme,
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, [ariaLabel, placeholder]);

  // Controlled sync: push external `value` changes into the doc. Edits that
  // originated in the editor already match via valueRef and dispatch nothing.
  useEffect(() => {
    valueRef.current = value;
    const view = viewRef.current;
    if (view === null) {
      return;
    }
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  // Steal focus after Base UI's initial focus pass (same rAF pattern as the
  // panel's textarea and the column-menu rename input).
  useEffect(() => {
    if (!autoFocus) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      viewRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [autoFocus]);

  useEffect(() => {
    if (editorRef === undefined) {
      return;
    }
    editorRef.current = {
      focus: () => {
        viewRef.current?.focus();
      },
      insertText: (text, caretOffset) => {
        const view = viewRef.current;
        if (view === null) {
          return;
        }
        const { from, to } = view.state.selection.main;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + caretOffset },
        });
        view.focus();
      },
      insertSnippet: (name, params) => {
        const view = viewRef.current;
        if (view === null) {
          return;
        }
        insertSnippetAt(view, view.state.selection.main, name, params);
        view.focus();
      },
      replaceRange: (from, to, text) => {
        const view = viewRef.current;
        if (view === null) {
          return;
        }
        // Clamp: the menu's span was captured at tap time; if the doc shrank
        // since (external controlled sync), a stale span must not throw.
        const docLength = view.state.doc.length;
        const start = Math.min(from, docLength);
        const end = Math.min(Math.max(to, start), docLength);
        view.dispatch({
          changes: { from: start, insert: text, to: end },
          selection: { anchor: start + text.length },
        });
        view.focus();
      },
    };
    return () => {
      editorRef.current = null;
    };
  }, [editorRef]);

  return (
    <div
      className={cn(
        // Mirrors the Textarea component's chrome; focus ring moves to
        // focus-within because the editable node is a nested contenteditable.
        "w-full rounded-lg border border-border bg-input/30 font-mono text-xs outline-none transition-colors focus-within:border-ring dark:bg-input/30",
        className
      )}
      ref={containerRef}
    />
  );
}
