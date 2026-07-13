import {
  acceptCompletion,
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  completionStatus,
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
} from "@/lib/formula/check.ts";
import {
  type FormulaHighlightKind,
  formulaEnclosingCallAt,
  formulaPropIdSpans,
  highlightFormula,
} from "@/lib/formula/highlight.ts";
import { FORMULA_SCOPE_ROOTS, parseFormula } from "@/lib/formula/parse.ts";
import {
  canonicalPropertyReference,
  canonicalPropertyRewrites,
  type FormulaSpanRewrite,
} from "@/lib/formula/ref-rewrite.ts";
import {
  BOOLEAN_TYPE,
  type FormulaType,
  UNKNOWN_TYPE,
} from "@/lib/formula/types.ts";
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
 * The document is the CANONICAL expression (`prop("<fieldId>")` references —
 * exactly what gets stored). Canonical property spans render as atomic
 * schema-labeled chips ({@link PropertyChipWidget}): `Decoration.replace`
 * widgets over the canonical text plus `EditorView.atomicRanges`, so arrow
 * keys skip a chip, backspace/delete removes the whole reference, and
 * selection treats it as one unit. Chip labels recompute from the live
 * schema (`fields` prop → {@link chipFields} state field), so a rename while
 * the editor is open relabels chips in place; ids matching no field render a
 * destructive "Unknown property" chip. Hand-typed display references
 * (`thisPage.X`) stay plain highlighted text while typing and are converted
 * to canonical chips shortly after the reference is complete AND the caret
 * has left its span ({@link typedReferenceCanonicalizer}).
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
   * Splice `text` at the caret (replacing any selection), then place the
   * caret `caretOffset` characters into the inserted text and refocus.
   */
  insertText: (text: string, caretOffset: number) => void;
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
  /** Receives the imperative handle; `null` while unmounted. */
  editorRef?: RefObject<FormulaCodeEditorHandle | null>;
  /**
   * Live database schema: chip labels/icons recompute from it, so pass the
   * CURRENT fields on every render (a rename relabels open chips).
   */
  fields: readonly DatabaseField[];
  onChange: (value: string) => void;
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

function buildChipDecorations(state: EditorState): DecorationSet {
  const fieldsById = new Map(
    state.field(chipFields).map((field) => [field.id, field])
  );
  const diagnosedStarts = state.field(diagnosticsField).diagnosedChipStarts;
  const builder = new RangeSetBuilder<Decoration>();
  for (const span of formulaPropIdSpans(state.doc.toString())) {
    builder.add(
      span.start,
      span.end,
      Decoration.replace({
        widget: new PropertyChipWidget(
          fieldsById.get(span.id) ?? null,
          span.id,
          diagnosedStarts.has(span.start)
        ),
      })
    );
  }
  return builder.finish();
}

/**
 * Chip rendering + atomicity: `Decoration.replace` widgets over every
 * canonical property span, provided as `atomicRanges` so cursor motion,
 * deletion, and selection treat each chip as a single unit. Rebuilds on
 * diagnostics passes too — a diagnosed chip renders its own destructive
 * ring (see {@link FormulaDiagnostics}).
 */
const propertyChips = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildChipDecorations(view.state);
    }

    update(update: ViewUpdate) {
      const fieldsChanged =
        update.startState.field(chipFields) !== update.state.field(chipFields);
      const diagnosticsChanged =
        update.startState.field(diagnosticsField).diagnosedChipStarts !==
        update.state.field(diagnosticsField).diagnosedChipStarts;
      if (update.docChanged || fieldsChanged || diagnosticsChanged) {
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
 * Converts hand-typed display references (`thisPage.X` — and pasted
 * name-form `prop("X")`) into canonical `prop("<id>")` chips once the doc
 * parses, debounced, and ONLY for spans the caret/selection isn't touching —
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
      const rewrites = canonicalPropertyRewrites(
        state.doc.toString(),
        state.field(chipFields)
      ).filter((rewrite) => !selectionTouches(state.selection, rewrite));
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
  const chips = formulaPropIdSpans(source);
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
  for (const chip of formulaPropIdSpans(source)) {
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
 * classes): the field-type/custom icon for properties, a function glyph for
 * functions, an empty spacer for keywords so columns stay aligned.
 */
function renderCompletionIcon(completion: Completion): Node {
  const holder = document.createElement("span");
  holder.className = "cm-formula-completion-icon";
  holder.setAttribute("aria-hidden", "true");
  const field = completionFields.get(completion);
  if (field !== undefined) {
    holder.append(chipIcon(field));
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
 * card, applied as `name()` with the caret inside the parens — after them
 * for zero-argument functions (`now()`/`today()`).
 */
function functionCompletion(
  entry: FormulaFunctionEntry,
  expected: FormulaType | null
): Completion {
  return {
    apply: (view, _completion, from, to) => {
      const insert = `${entry.name}()`;
      const caret =
        from + entry.name.length + (entry.params.length === 0 ? 2 : 1);
      applyInsert(view, { from, to }, insert, caret);
    },
    boost: typeMatchBoost(entry.returns, expected),
    detail: formulaFunctionSignature(entry).slice(entry.name.length),
    info: entry.description,
    label: entry.name,
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
  const word = context.matchBefore(IDENTIFIER_TAIL_RE);
  const from = word?.from ?? context.pos;
  const doc = context.state.doc.toString();
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
    options.push(...keywordCompletions(expected));
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
  onSubmit?: () => void;
}

/** The CM6 formula editor (see module docs). */
export function FormulaCodeEditor({
  ariaLabel,
  autoFocus = false,
  checkContext,
  className,
  editorRef,
  fields,
  onChange,
  onSubmit,
  placeholder,
  value,
}: FormulaCodeEditorProps): ReactNode {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const callbacksRef = useRef<EditorCallbacks>({ onChange, onSubmit });
  /**
   * Doc text the React side last saw — written by the update listener before
   * `onChange` so the controlled-sync effect skips redundant dispatches, and
   * read at (re)create time so a mount uses the freshest value.
   */
  const valueRef = useRef(value);
  /** Latest schema, read at (re)create time to seed the chip state field. */
  const fieldsRef = useRef(fields);
  /** Latest check context, read at (re)create time to seed its state field. */
  const checkContextRef = useRef(checkContext);

  useEffect(() => {
    callbacksRef.current = { onChange, onSubmit };
  }, [onChange, onSubmit]);

  // Push schema changes into editor state so open chips relabel live.
  useEffect(() => {
    fieldsRef.current = fields;
    viewRef.current?.dispatch({ effects: setChipFields.of(fields) });
  }, [fields]);

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
          keymap.of([
            {
              key: "Mod-Enter",
              run: () => {
                callbacksRef.current.onSubmit?.();
                return true;
              },
            },
            // Tab accepts like Enter while the popup is open; when it's
            // closed the binding declines and Tab keeps moving focus.
            { key: "Tab", run: acceptCompletion },
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
          checkContextState.init(() => checkContextRef.current),
          propertyChips,
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
