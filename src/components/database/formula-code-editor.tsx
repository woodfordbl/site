import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import {
  type EditorSelection,
  EditorState,
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
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import { DATABASE_FIELD_TYPE_ICON_NODES } from "@/components/database/database-field-icons.ts";
import { tokenChipVariants } from "@/components/ui/chip.tsx";
import {
  type FormulaHighlightKind,
  formulaPropIdSpans,
  highlightFormula,
} from "@/lib/formula/highlight.ts";
import {
  canonicalPropertyRewrites,
  type FormulaSpanRewrite,
} from "@/lib/formula/ref-rewrite.ts";
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
 * ({@link highlightFormula}) — autocomplete and the info card are later
 * stages. Menu integration is built in: every key except Escape stops
 * propagating (the panel lives inside a Base UI menu popup whose typeahead
 * would otherwise steal keystrokes), Escape bubbles so the menu closes, and
 * Mod+Enter fires `onSubmit`.
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
  svg.setAttribute("class", "size-3.5 shrink-0");
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
    emoji.className = "shrink-0 select-none leading-none";
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
  private readonly field: DatabaseField | null;
  private readonly rawId: string;

  constructor(field: DatabaseField | null, rawId: string) {
    super();
    this.field = field;
    this.rawId = rawId;
  }

  eq(other: PropertyChipWidget): boolean {
    return (
      other.rawId === this.rawId &&
      other.field?.name === this.field?.name &&
      other.field?.type === this.field?.type &&
      other.field?.icon === this.field?.icon
    );
  }

  toDOM(): HTMLElement {
    const chip = document.createElement("span");
    chip.className = cn(
      tokenChipVariants({ tone: this.field === null ? "destructive" : "blue" }),
      "cm-formula-chip select-none py-0 align-baseline",
      this.field === null && "line-through"
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
  const builder = new RangeSetBuilder<Decoration>();
  for (const span of formulaPropIdSpans(state.doc.toString())) {
    builder.add(
      span.start,
      span.end,
      Decoration.replace({
        widget: new PropertyChipWidget(
          fieldsById.get(span.id) ?? null,
          span.id
        ),
      })
    );
  }
  return builder.finish();
}

/**
 * Chip rendering + atomicity: `Decoration.replace` widgets over every
 * canonical property span, provided as `atomicRanges` so cursor motion,
 * deletion, and selection treat each chip as a single unit.
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
      if (update.docChanged || fieldsChanged) {
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

  useEffect(() => {
    callbacksRef.current = { onChange, onSubmit };
  }, [onChange, onSubmit]);

  // Push schema changes into editor state so open chips relabel live.
  useEffect(() => {
    fieldsRef.current = fields;
    viewRef.current?.dispatch({ effects: setChipFields.of(fields) });
  }, [fields]);

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
          keymap.of([
            {
              key: "Mod-Enter",
              run: () => {
                callbacksRef.current.onSubmit?.();
                return true;
              },
            },
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
          // Keep menu typeahead/arrow handling away from the editor; Escape
          // still bubbles so the enclosing menu closes (same contract as the
          // panel's stopMenuKeys). Returning false lets CM handle the key.
          EditorView.domEventHandlers({
            keydown: (event) => {
              if (event.key !== "Escape") {
                event.stopPropagation();
              }
              return false;
            },
          }),
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
          propertyChips,
          typedReferenceCanonicalizer,
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
        "w-full rounded-lg border border-border bg-input/30 font-mono text-xs outline-none transition-colors focus-within:border-ring dark:bg-input/30"
      )}
      ref={containerRef}
    />
  );
}
