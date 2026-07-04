import {
  type ClipboardEvent,
  type KeyboardEvent,
  type Ref,
  type SyntheticEvent,
  useCallback,
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

/** Imperative handle so the panel's reference list can insert at the caret. */
export interface FormulaCodeFieldHandle {
  focus: () => void;
  /** Splice `text` at the caret, leaving the caret `caretOffset` chars in. */
  insertAtCaret: (text: string, caretOffset: number) => void;
}

export interface FormulaCodeFieldProps {
  ariaLabel?: string;
  className?: string;
  fields: readonly DatabaseField[];
  handleRef?: Ref<FormulaCodeFieldHandle>;
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
  onChange,
  onKeyDown,
  placeholder,
  value,
}: FormulaCodeFieldProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);

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

  // Initial (and SSR) markup; identity is stable so React never rewrites it —
  // the layout effect owns syncing the DOM to the model after mount.
  const initialHtmlRef = useRef<{ __html: string } | null>(null);
  if (initialHtmlRef.current === null) {
    initialHtmlRef.current = { __html: sourceToHtml(value, fieldByName) };
  }

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || composingRef.current) {
      return;
    }
    const html = sourceToHtml(value, fieldByName);
    if (root.innerHTML === html) {
      return;
    }
    const hadFocus = root.ownerDocument.activeElement === root;
    const caret = hadFocus ? getFormulaCaret(root) : null;
    root.innerHTML = html;
    if (caret) {
      setFormulaCaret(root, {
        start: Math.min(caret.start, value.length),
        end: Math.min(caret.end, value.length),
      });
    }
  });

  const emit = useCallback(() => {
    const root = rootRef.current;
    if (root) {
      onChange(serializeFormulaDom(root));
    }
  }, [onChange]);

  const handleInput = useCallback(() => {
    if (!composingRef.current) {
      emit();
    }
  }, [emit]);

  useImperativeHandle(
    handleRef,
    () => ({
      focus: () => rootRef.current?.focus(),
      insertAtCaret: (text: string, caretOffset: number) => {
        const root = rootRef.current;
        if (!root) {
          return;
        }
        root.focus();
        const source = serializeFormulaDom(root);
        const caret = getFormulaCaret(root);
        const start = caret?.start ?? source.length;
        const end = caret?.end ?? source.length;
        onChange(source.slice(0, start) + text + source.slice(end));
        const next = start + caretOffset;
        // Restore the caret after the value change rebuilds the DOM.
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
      }
    },
    [emit]
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
      onCompositionEnd={() => {
        composingRef.current = false;
        emit();
      }}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onInput={handleInput}
      onKeyDown={onKeyDown}
      onPaste={handlePaste}
      ref={rootRef}
      role="textbox"
      spellCheck={false}
      tabIndex={0}
    />
  );
}
