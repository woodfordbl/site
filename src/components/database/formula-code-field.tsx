import {
  type ClipboardEvent,
  type KeyboardEvent,
  type Ref,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  BLOCK_COLOR_DEFS,
  BLOCK_COLOR_IDS,
} from "@/lib/blocks/block-colors.ts";
import {
  getFormulaCaret,
  serializeFormulaDom,
  setFormulaCaret,
} from "@/lib/editor/formula-dom.ts";
import { insertPlainTextAtSelection } from "@/lib/editor/rich-text-dom.ts";
import { scanExpressionSegments } from "@/lib/expr/highlight.ts";
import type {
  DatabaseField,
  DatabaseFieldType,
} from "@/lib/schemas/database.ts";
import type { BlockColor } from "@/lib/schemas/rich-text.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Syntax-highlighted, chip-rendering formula editor. A contenteditable surface
 * whose plain-text value is the formula source: `lib/expr/highlight` classifies
 * each run into a colored token span, and `thisPage.Field` references render as
 * atomic chips (type glyph + field name, tinted by a stable per-field color).
 * The DOM is rebuilt from the source on every change so coloring stays live;
 * the caret is preserved through `formula-dom`'s source-offset helpers (a chip
 * counts as its full source length, not its short label). IME composition
 * suspends rebuilds. Mirrors the `RichTextArea` pattern.
 */

/** Monospace-friendly type glyph shown at the head of a property chip. */
const FIELD_TYPE_GLYPH: Record<DatabaseFieldType, string> = {
  text: "T",
  number: "#",
  checkbox: "☑",
  select: "▾",
  multiSelect: "≣",
  date: "◷",
  url: "↗",
  formula: "ƒ",
};

/** Token class → text color, reusing the theme-aware block-text palette. */
const SEGMENT_COLOR: Record<string, string> = {
  function: "text-(--block-text-blue)",
  number: "text-(--block-text-pink)",
  string: "text-(--block-text-green)",
  keyword: "text-(--block-text-purple)",
  operator: "text-(--block-text-orange)",
  variable: "text-(--block-text-brown)",
  punctuation: "text-muted-foreground",
};

/** Palette used for per-field chip tints (gray reserved for unknown refs). */
const CHIP_COLORS = BLOCK_COLOR_IDS.filter((color) => color !== "gray");

/** A stable chip color for a field, derived from its id so it never shifts. */
function chipColorForField(field: DatabaseField): BlockColor {
  let hash = 0;
  for (const char of field.id) {
    hash = (hash * 31 + char.charCodeAt(0)) % 2_147_483_647;
  }
  return CHIP_COLORS[hash % CHIP_COLORS.length];
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => HTML_ESCAPES[char] ?? char);
}

const CHIP_BASE_CLASS =
  "mx-px inline-flex select-none items-center gap-1 rounded-[0.3rem] px-1.5 align-baseline font-sans font-medium text-[0.9em] [&>.chip-glyph]:opacity-60";

/** Build the HTML for one property chip (atomic, carries its source). */
function chipHtml(
  source: string,
  field: DatabaseField | undefined,
  name: string
): string {
  const label = field ? field.name : name;
  const glyph = field ? FIELD_TYPE_GLYPH[field.type] : "?";
  const tint = field
    ? cn(
        BLOCK_COLOR_DEFS[chipColorForField(field)].bgClass,
        BLOCK_COLOR_DEFS[chipColorForField(field)].textClass
      )
    : "bg-muted text-muted-foreground";
  return `<span data-formula-chip data-source="${escapeHtml(
    source
  )}" contenteditable="false" class="${CHIP_BASE_CLASS} ${tint}"><span class="chip-glyph font-mono text-[0.85em]">${escapeHtml(
    glyph
  )}</span>${escapeHtml(label)}</span>`;
}

/** Source → the field's inner HTML: colored token spans + property chips. */
function sourceToHtml(
  source: string,
  fieldByName: Map<string, DatabaseField>
): string {
  return scanExpressionSegments(source)
    .map((segment) => {
      if (segment.className === "property") {
        const name = segment.propertyName ?? "";
        return chipHtml(
          segment.text,
          fieldByName.get(name.toLowerCase()),
          name
        );
      }
      if (segment.className === "text") {
        return escapeHtml(segment.text);
      }
      const color = SEGMENT_COLOR[segment.className] ?? "";
      return `<span class="${color}">${escapeHtml(segment.text)}</span>`;
    })
    .join("");
}

/** Imperative handle so the panel's reference list can edit the source. */
export interface FormulaCodeFieldHandle {
  focus: () => void;
  /**
   * Replace source `[start, end)` with `text`, leaving the caret `caretOffset`
   * characters into the inserted text. Uses absolute source offsets (the panel
   * tracks the caret) so it is robust even if the field lost focus to a click.
   */
  replaceRange: (
    start: number,
    end: number,
    text: string,
    caretOffset: number
  ) => void;
}

export interface FormulaCodeFieldProps {
  ariaLabel?: string;
  className?: string;
  fields: readonly DatabaseField[];
  handleRef?: Ref<FormulaCodeFieldHandle>;
  /** Reports the caret (source offset) on user edits/navigation, for autocomplete. */
  onCaretChange?: (caret: number) => void;
  onChange: (source: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  placeholder?: string;
  value: string;
}

/** The syntax-highlighted, chip-rendering formula field (see module docs). */
export function FormulaCodeField({
  ariaLabel,
  className,
  fields,
  handleRef,
  onCaretChange,
  onChange,
  onKeyDown,
  placeholder,
  value,
}: FormulaCodeFieldProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const recolorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fieldByName = useMemo(() => {
    const map = new Map<string, DatabaseField>();
    for (const field of fields) {
      const key = field.name.trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, field);
      }
    }
    return map;
  }, [fields]);
  // Latest map for the debounced/blur callbacks (avoids stale closures).
  const fieldByNameRef = useRef(fieldByName);
  fieldByNameRef.current = fieldByName;

  // Initial (and SSR) markup; identity is stable so React never rewrites it.
  const initialHtmlRef = useRef<{ __html: string } | null>(null);
  if (initialHtmlRef.current === null) {
    initialHtmlRef.current = { __html: sourceToHtml(value, fieldByName) };
  }

  /**
   * Re-tokenize the DOM in place: recolor spans and (re)build chips from
   * whatever source the field currently holds, preserving the caret. This is
   * the ONLY thing that replaces the DOM, and it deliberately runs on a pause
   * or on blur — never per keystroke — so typing stays native and smooth.
   */
  const recolor = useCallback((preserveCaret: boolean) => {
    const root = rootRef.current;
    if (!root || composingRef.current) {
      return;
    }
    const source = serializeFormulaDom(root);
    const html = sourceToHtml(source, fieldByNameRef.current);
    if (root.innerHTML === html) {
      return;
    }
    const caret = preserveCaret ? getFormulaCaret(root) : null;
    root.innerHTML = html;
    if (caret) {
      setFormulaCaret(root, {
        start: Math.min(caret.start, source.length),
        end: Math.min(caret.end, source.length),
      });
    }
  }, []);

  // Sync the DOM only on EXTERNAL value changes (programmatic insert, reset).
  // A change whose text already matches the DOM came from our own typing — we
  // leave that DOM alone so the native edit isn't disturbed.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || composingRef.current || serializeFormulaDom(root) === value) {
      return;
    }
    const hadFocus = root.ownerDocument.activeElement === root;
    const caret = hadFocus ? getFormulaCaret(root) : null;
    root.innerHTML = sourceToHtml(value, fieldByName);
    if (caret) {
      setFormulaCaret(root, {
        start: Math.min(caret.start, value.length),
        end: Math.min(caret.end, value.length),
      });
    }
  }, [value, fieldByName]);

  useEffect(
    () => () => {
      if (recolorTimerRef.current) {
        clearTimeout(recolorTimerRef.current);
      }
    },
    []
  );

  const emit = useCallback(() => {
    const root = rootRef.current;
    if (root) {
      onChange(serializeFormulaDom(root));
    }
  }, [onChange]);

  const reportCaret = useCallback(() => {
    const root = rootRef.current;
    if (root && onCaretChange) {
      onCaretChange(getFormulaCaret(root)?.start ?? 0);
    }
  }, [onCaretChange]);

  const handleInput = useCallback(() => {
    if (composingRef.current) {
      return;
    }
    emit();
    reportCaret();
    // Recolor shortly after typing pauses (never mid-keystroke).
    if (recolorTimerRef.current) {
      clearTimeout(recolorTimerRef.current);
    }
    recolorTimerRef.current = setTimeout(() => recolor(true), 350);
  }, [emit, recolor, reportCaret]);

  useImperativeHandle(
    handleRef,
    () => ({
      focus: () => rootRef.current?.focus(),
      replaceRange: (
        start: number,
        end: number,
        text: string,
        caretOffset: number
      ) => {
        const root = rootRef.current;
        if (!root) {
          return;
        }
        const source = serializeFormulaDom(root);
        const from = Math.max(0, Math.min(start, source.length));
        const to = Math.max(from, Math.min(end, source.length));
        onChange(source.slice(0, from) + text + source.slice(to));
        const next = from + caretOffset;
        // The value change rebuilds the DOM (external path); place caret after.
        requestAnimationFrame(() => {
          const current = rootRef.current;
          if (current) {
            current.focus();
            setFormulaCaret(current, { start: next, end: next });
          }
        });
      },
    }),
    [onChange]
  );

  // Backspace/Delete adjacent to a chip removes the WHOLE reference in one go,
  // rather than leaving the browser to chip away at its inner label.
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event);
      if (
        event.defaultPrevented ||
        composingRef.current ||
        (event.key !== "Backspace" && event.key !== "Delete")
      ) {
        return;
      }
      const root = rootRef.current;
      const caret = root ? getFormulaCaret(root) : null;
      if (!(root && caret) || caret.start !== caret.end) {
        return;
      }
      const source = serializeFormulaDom(root);
      const chips = scanExpressionSegments(source).filter(
        (segment) => segment.className === "property"
      );
      const target =
        event.key === "Backspace"
          ? chips.find((chip) => chip.end === caret.start)
          : chips.find((chip) => chip.start === caret.start);
      if (!target) {
        return;
      }
      event.preventDefault();
      onChange(source.slice(0, target.start) + source.slice(target.end));
      requestAnimationFrame(() => {
        const current = rootRef.current;
        if (current) {
          current.focus();
          setFormulaCaret(current, { start: target.start, end: target.start });
        }
      });
    },
    [onChange, onKeyDown]
  );

  // Enter never splits the field into <div>s: insert a literal newline (the
  // surface wraps via `white-space: pre-wrap`) so the source stays flat text.
  const handleBeforeInput = useCallback(
    (event: SyntheticEvent<HTMLDivElement, InputEvent>) => {
      const inputType = event.nativeEvent.inputType;
      if (inputType === "insertParagraph" || inputType === "insertLineBreak") {
        event.preventDefault();
        const root = rootRef.current;
        if (root) {
          insertPlainTextAtSelection(root, "\n");
          emit();
        }
      }
    },
    [emit]
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      event.preventDefault();
      const root = rootRef.current;
      const pasted = event.clipboardData.getData("text/plain");
      if (root && pasted) {
        insertPlainTextAtSelection(root, pasted);
        emit();
        recolor(true);
      }
    },
    [emit, recolor]
  );

  return (
    // biome-ignore lint/a11y/useSemanticElements: contenteditable — native inputs cannot render chips or colored spans.
    <div
      aria-label={ariaLabel}
      aria-multiline="true"
      className={cn(
        "min-h-12 w-full cursor-text whitespace-pre-wrap break-words rounded-lg border border-border bg-input/30 px-2.5 py-2 font-mono text-base outline-none focus-visible:border-ring md:text-sm",
        "empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]",
        className
      )}
      contentEditable
      // biome-ignore lint/security/noDangerouslySetInnerHtml: markup is built from our own escaped model so SSR ships content.
      dangerouslySetInnerHTML={initialHtmlRef.current}
      data-placeholder={placeholder}
      onBeforeInput={handleBeforeInput}
      onBlur={() => recolor(false)}
      onCompositionEnd={() => {
        composingRef.current = false;
        emit();
      }}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onFocus={reportCaret}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onKeyUp={reportCaret}
      onMouseUp={reportCaret}
      onPaste={handlePaste}
      ref={rootRef}
      role="textbox"
      spellCheck={false}
      tabIndex={0}
    />
  );
}
