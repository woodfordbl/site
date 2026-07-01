import {
  type KeyboardEvent,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { RichTextArea } from "@/components/editor/rich-text-area.tsx";
import { useAutoFocus } from "@/hooks/use-auto-focus.ts";
import { getBlockIndent } from "@/lib/blocks/block-indent.ts";
import { toggleMarkInRange } from "@/lib/blocks/rich-text.ts";
import { matchMarkdownShortcut } from "@/lib/canvas/markdown-shortcuts.ts";
import {
  type CanvasField,
  type FieldSelection,
  focusFieldAtPlacement,
  focusFieldAtSelection,
  getFieldSelection,
} from "@/lib/editor/caret-navigation.ts";
import {
  handleBlockArrowKeyDown,
  handleBlockIndentKeyDown,
  handleBlockModifierArrowKeyDown,
  handleSlashMenuKeyDown,
  resolveFormattingShortcut,
  resolveStructuralDeleteKey,
} from "@/lib/editor/field-keydown.ts";
import type { RichTextDomSnapshot } from "@/lib/editor/rich-text-dom.ts";
import type { InlineMark } from "@/lib/schemas/rich-text.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Canvas editor fields: no chrome, no focus ring. Textareas grow via
 * field-sizing-content. Text color is inherited (not `text-foreground`) so
 * block-level colors on the shell flow into the field.
 */
export const editorFieldClassName =
  "block min-h-0 w-full overflow-visible rounded-none border-none bg-transparent px-1 py-0 shadow-none outline-none placeholder:text-muted-foreground focus-visible:border-none focus-visible:ring-0 dark:bg-transparent disabled:bg-transparent";

export const editorTextareaClassName =
  "field-sizing-content resize-none overflow-hidden";

/** Placeholder for the rich-text surface (native fields use `placeholder=`). */
const richPlaceholderClassName =
  "empty:before:pointer-events-none empty:before:absolute empty:before:top-0 empty:before:left-1 empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]";

interface EditableSurfaceProps {
  ariaLabel?: string;
  autoFocus?: boolean;
  autoFocusOffset?: number;
  autoFocusPlacement?: "start" | "end";
  className?: string;
  indent?: number;
  /**
   * Inline marks over `value`. Passing marks (even `[]`) switches the surface
   * to the rich-text contenteditable field and enables formatting shortcuts;
   * `onChange` then reports the edited marks as its second argument.
   */
  marks?: InlineMark[];
  multiline?: boolean;
  onAutoFocusHandled?: () => void;
  onChange: (value: string, marks?: InlineMark[]) => void;
  onEnter?: (selection: FieldSelection) => void;
  onExtendSelectionDown?: () => void;
  onExtendSelectionUp?: () => void;
  onIndentChange?: (indent: number) => void;
  /** Return true when the key event is fully handled (skips default Enter/arrow/delete). */
  onKeyDown?: (event: KeyboardEvent<CanvasField>) => boolean;
  onMarkdownShortcut?: () => boolean;
  onMoveRowDown?: () => void;
  onMoveRowUp?: () => void;
  onNavigateDown?: () => void;
  onNavigateUp?: () => void;
  onSlash?: (query: string, caret: FieldSelection) => void;
  onSlashClose?: () => void;
  onSlashDismiss?: () => void;
  onSlashLinkBack?: () => void;
  onSlashMenuConfirm?: () => void;
  onSlashMenuNavigate?: (direction: "up" | "down") => void;
  /** Return true when structural backspace/delete was handled. */
  onStructuralKey?: (
    caretAtStart: boolean,
    key: "Backspace" | "Delete"
  ) => boolean;
  onTextBlur?: () => void;
  onTextFocus?: () => void;
  placeholder?: string;
  /** When to show placeholder on empty fields. Headings use `when-empty`. */
  placeholderVisibility?: "when-focused" | "when-empty";
  slashCaret?: FieldSelection;
  slashMenuOpen?: boolean;
  slashPhase?: "root" | "link";
  value: string;
}

export function EditableSurface({
  value,
  marks,
  onChange,
  onSlash,
  onSlashClose,
  onSlashDismiss,
  onSlashLinkBack,
  onEnter,
  onStructuralKey,
  indent = 0,
  onIndentChange,
  onSlashMenuConfirm,
  onSlashMenuNavigate,
  onKeyDown: onKeyDownProp,
  onMarkdownShortcut,
  placeholder,
  placeholderVisibility = "when-focused",
  className,
  multiline = false,
  ariaLabel,
  autoFocus = false,
  autoFocusOffset,
  autoFocusPlacement = "start",
  onExtendSelectionDown,
  onExtendSelectionUp,
  onMoveRowDown,
  onMoveRowUp,
  onNavigateUp,
  onNavigateDown,
  onAutoFocusHandled,
  slashMenuOpen = false,
  slashPhase = "root",
  slashCaret,
  onTextFocus,
  onTextBlur,
}: EditableSurfaceProps) {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const richRef = useRef<HTMLDivElement>(null);
  const isRich = marks !== undefined;

  const assignFieldRef = useCallback(
    (node: HTMLInputElement | HTMLTextAreaElement | null) => {
      if (node instanceof HTMLInputElement) {
        inputRef.current = node;
      } else if (node instanceof HTMLTextAreaElement) {
        textareaRef.current = node;
      } else {
        inputRef.current = null;
        textareaRef.current = null;
      }
    },
    []
  );

  const getField = useCallback((): CanvasField | null => {
    if (isRich) {
      return richRef.current;
    }
    return multiline ? textareaRef.current : inputRef.current;
  }, [isRich, multiline]);

  const applyAutoFocus = useCallback(() => {
    const field = getField();
    if (!field) {
      return;
    }

    if (autoFocusOffset === undefined) {
      focusFieldAtPlacement(field, autoFocusPlacement);
    } else {
      focusFieldAtSelection(field, {
        start: autoFocusOffset,
        end: autoFocusOffset,
      });
    }
  }, [autoFocusOffset, autoFocusPlacement, getField]);

  useAutoFocus({
    enabled: autoFocus,
    onFocus: applyAutoFocus,
    onHandled: onAutoFocusHandled,
  });

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<CanvasField>) => {
      const absorbKeyEvent = () => {
        event.stopPropagation();
      };

      if (onKeyDownProp?.(event)) {
        absorbKeyEvent();
        return;
      }

      if (isRich) {
        const formatting = resolveFormattingShortcut(event);
        if (formatting) {
          event.preventDefault();
          const selection = getFieldSelection(event.currentTarget);
          if (selection.start !== selection.end) {
            onChange(
              value,
              toggleMarkInRange(
                marks ?? [],
                formatting,
                selection.start,
                selection.end,
                value.length
              )
            );
          }
          absorbKeyEvent();
          return;
        }
      }

      if (
        slashMenuOpen &&
        handleSlashMenuKeyDown(event, {
          phase: slashPhase,
          onClose: onSlashClose,
          onDismiss: onSlashDismiss,
          onConfirm: onSlashMenuConfirm,
          onLinkBack: onSlashLinkBack,
          onNavigate: onSlashMenuNavigate,
        })
      ) {
        absorbKeyEvent();
        return;
      }

      if (
        handleBlockModifierArrowKeyDown(event, {
          onExtendSelectionDown,
          onExtendSelectionUp,
          onMoveRowDown,
          onMoveRowUp,
        })
      ) {
        absorbKeyEvent();
        return;
      }

      if (
        handleBlockArrowKeyDown(event, {
          onNavigateDown,
          onNavigateUp,
        })
      ) {
        absorbKeyEvent();
        return;
      }

      if (
        handleBlockIndentKeyDown(event, {
          indent: getBlockIndent({ indent }),
          onIndentChange,
        })
      ) {
        absorbKeyEvent();
        return;
      }

      if (
        event.key === " " &&
        onMarkdownShortcut &&
        !slashMenuOpen &&
        matchMarkdownShortcut(value)
      ) {
        const caret = getFieldSelection(event.currentTarget);
        if (caret.start === caret.end && caret.end === value.length) {
          event.preventDefault();
          if (onMarkdownShortcut()) {
            absorbKeyEvent();
            return;
          }
        }
      }

      if (event.key === "Enter" && !event.shiftKey && onEnter) {
        event.preventDefault();
        onEnter(getFieldSelection(event.currentTarget));
        absorbKeyEvent();
        return;
      }

      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        onStructuralKey
      ) {
        const keyResult = resolveStructuralDeleteKey(event, value.length === 0);
        if (keyResult.handled) {
          const handled = onStructuralKey(
            keyResult.caretAtStart,
            keyResult.key
          );
          if (handled) {
            event.preventDefault();
            absorbKeyEvent();
            return;
          }
        }
      }

      absorbKeyEvent();
    },
    [
      isRich,
      marks,
      onChange,
      onEnter,
      onIndentChange,
      indent,
      onKeyDownProp,
      onMarkdownShortcut,
      onExtendSelectionDown,
      onExtendSelectionUp,
      onMoveRowDown,
      onMoveRowUp,
      onNavigateDown,
      onNavigateUp,
      onSlashClose,
      onSlashDismiss,
      onSlashLinkBack,
      onSlashMenuConfirm,
      onSlashMenuNavigate,
      onStructuralKey,
      slashMenuOpen,
      slashPhase,
      value,
    ]
  );

  const emitSlash = useCallback(
    (nextValue: string, caret: FieldSelection) => {
      if (!onSlash) {
        return;
      }
      if (nextValue.startsWith("/")) {
        onSlash(nextValue.slice(1), caret);
      } else {
        onSlashClose?.();
      }
    },
    [onSlash, onSlashClose]
  );

  const handleChange = useCallback(
    (
      nextValue: string,
      field: HTMLInputElement | HTMLTextAreaElement | null
    ) => {
      const caret = field
        ? getFieldSelection(field)
        : { start: nextValue.length, end: nextValue.length };

      onChange(nextValue);
      emitSlash(nextValue, caret);
    },
    [emitSlash, onChange]
  );

  const handleRichInput = useCallback(
    (snapshot: RichTextDomSnapshot) => {
      const field = richRef.current;
      const caret = field
        ? getFieldSelection(field)
        : { start: snapshot.text.length, end: snapshot.text.length };

      onChange(snapshot.text, snapshot.marks);
      emitSlash(snapshot.text, caret);
    },
    [emitSlash, onChange]
  );

  useLayoutEffect(() => {
    if (!(slashMenuOpen && slashCaret)) {
      return;
    }

    const field = getField();
    if (!field) {
      return;
    }

    const length = value.length;
    const start = Math.min(slashCaret.start, length);
    const end = Math.min(slashCaret.end, length);

    const current = getFieldSelection(field);
    if (current.start === start && current.end === end) {
      return;
    }

    focusFieldAtSelection(field, { start, end });
  }, [getField, slashCaret, slashMenuOpen, value.length]);

  const showPlaceholder =
    value.length === 0 && (placeholderVisibility === "when-empty" || isFocused);
  const fieldClassName = cn(editorFieldClassName, "relative z-10", className);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    onTextFocus?.();
  }, [onTextFocus]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    onTextBlur?.();
  }, [onTextBlur]);

  if (isRich) {
    return (
      <RichTextArea
        ariaLabel={ariaLabel}
        className={cn(fieldClassName, richPlaceholderClassName)}
        fieldRef={richRef}
        marks={marks}
        multiline={multiline}
        onBlur={handleBlur}
        onFocus={handleFocus}
        onInput={handleRichInput}
        onKeyDown={handleKeyDown}
        placeholder={showPlaceholder ? placeholder : undefined}
        value={value}
      />
    );
  }

  if (multiline) {
    return (
      <textarea
        aria-label={ariaLabel}
        className={cn(fieldClassName, editorTextareaClassName)}
        data-canvas-field
        onBlur={handleBlur}
        onChange={(event) => handleChange(event.target.value, event.target)}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={showPlaceholder ? placeholder : undefined}
        ref={assignFieldRef}
        rows={1}
        value={value}
      />
    );
  }

  return (
    <input
      aria-label={ariaLabel}
      className={fieldClassName}
      data-canvas-field
      onBlur={handleBlur}
      onChange={(event) => handleChange(event.target.value, event.target)}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      placeholder={showPlaceholder ? placeholder : undefined}
      ref={assignFieldRef}
      type="text"
      value={value}
    />
  );
}
