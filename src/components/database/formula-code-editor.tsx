import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  placeholder as placeholderOf,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import {
  type FormulaHighlightKind,
  highlightFormula,
} from "@/lib/formula/highlight.ts";
import { cn } from "@/lib/utils.ts";

/**
 * CodeMirror 6 single-expression formula editor (desktop). Controlled via
 * `value`/`onChange`; imperative caret insertion via the `editorRef` handle
 * (same named-ref-prop pattern as grid-picker's `virtualizerRef`). This
 * module imports CM6 at module scope and is intended to be loaded through
 * `React.lazy` (see formula-editor-panel.tsx) so the CM6 chunk stays out of
 * the main bundle.
 *
 * Foundation slice only: soft-wrapped, autogrowing (min ~3 rows, capped with
 * internal scroll), no line numbers, syntax highlighting driven by the real
 * tokenizer ({@link highlightFormula}) — chips, autocomplete, and the info
 * card are later stages. Menu integration is built in: every key except
 * Escape stops propagating (the panel lives inside a Base UI menu popup whose
 * typeahead would otherwise steal keystrokes), Escape bubbles so the menu
 * closes, and Mod+Enter fires `onSubmit`.
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

  useEffect(() => {
    callbacksRef.current = { onChange, onSubmit };
  }, [onChange, onSubmit]);

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
