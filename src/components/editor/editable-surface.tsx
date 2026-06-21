import {
  type KeyboardEvent,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useAutoFocus } from "@/hooks/use-auto-focus.ts";
import { getBlockIndent } from "@/lib/blocks/block-indent.ts";
import { matchMarkdownShortcut } from "@/lib/canvas/markdown-shortcuts.ts";
import {
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
  resolveStructuralDeleteKey,
} from "@/lib/editor/field-keydown.ts";
import { cn } from "@/lib/utils.ts";

/** Canvas editor fields: no chrome, no focus ring. Textareas grow via field-sizing-content. */
export const editorFieldClassName =
  "block min-h-0 w-full overflow-visible rounded-none border-none bg-transparent px-1 py-0 text-foreground shadow-none outline-none placeholder:text-muted-foreground/50 focus-visible:border-none focus-visible:ring-0 dark:bg-transparent disabled:bg-transparent";

export const editorTextareaClassName =
  "field-sizing-content resize-none overflow-hidden";

interface EditableSurfaceProps {
  ariaLabel?: string;
  autoFocus?: boolean;
  autoFocusOffset?: number;
  autoFocusPlacement?: "start" | "end";
  className?: string;
  indent?: number;
  multiline?: boolean;
  onAutoFocusHandled?: () => void;
  onChange: (value: string) => void;
  onEnter?: (selection: FieldSelection) => void;
  onExtendSelectionDown?: () => void;
  onExtendSelectionUp?: () => void;
  onIndentChange?: (indent: number) => void;
  /** Return true when the key event is fully handled (skips default Enter/arrow/delete). */
  onKeyDown?: (
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => boolean;
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

  const applyAutoFocus = useCallback(() => {
    const field = multiline ? textareaRef.current : inputRef.current;
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
  }, [autoFocusOffset, autoFocusPlacement, multiline]);

  useAutoFocus({
    enabled: autoFocus,
    onFocus: applyAutoFocus,
    onHandled: onAutoFocusHandled,
  });

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const absorbKeyEvent = () => {
        event.stopPropagation();
      };

      if (onKeyDownProp?.(event)) {
        absorbKeyEvent();
        return;
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
        const field = event.currentTarget;
        const caretStart = field.selectionStart ?? value.length;
        const caretEnd = field.selectionEnd ?? caretStart;
        if (caretStart === caretEnd && caretEnd === value.length) {
          event.preventDefault();
          if (onMarkdownShortcut()) {
            absorbKeyEvent();
            return;
          }
        }
      }

      if (event.key === "Enter" && !event.shiftKey && onEnter) {
        event.preventDefault();
        const start = event.currentTarget.selectionStart ?? value.length;
        const end = event.currentTarget.selectionEnd ?? start;
        onEnter({ start, end });
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

  const handleChange = useCallback(
    (
      nextValue: string,
      field: HTMLInputElement | HTMLTextAreaElement | null
    ) => {
      const caret = field
        ? getFieldSelection(field)
        : { start: nextValue.length, end: nextValue.length };

      onChange(nextValue);

      if (onSlash) {
        if (nextValue.startsWith("/")) {
          onSlash(nextValue.slice(1), caret);
        } else {
          onSlashClose?.();
        }
      }
    },
    [onChange, onSlash, onSlashClose]
  );

  useLayoutEffect(() => {
    if (!(slashMenuOpen && slashCaret)) {
      return;
    }

    const field = multiline ? textareaRef.current : inputRef.current;
    if (!field) {
      return;
    }

    const start = Math.min(slashCaret.start, field.value.length);
    const end = Math.min(slashCaret.end, field.value.length);

    if (field.selectionStart === start && field.selectionEnd === end) {
      return;
    }

    field.setSelectionRange(start, end);
  }, [multiline, slashCaret, slashMenuOpen]);

  const showPlaceholder =
    value.length === 0 && (placeholderVisibility === "when-empty" || isFocused);
  const fieldClassName = cn(editorFieldClassName, "relative z-10", className);

  if (multiline) {
    return (
      <textarea
        aria-label={ariaLabel}
        className={cn(fieldClassName, editorTextareaClassName)}
        data-canvas-field
        onBlur={() => {
          setIsFocused(false);
          onTextBlur?.();
        }}
        onChange={(event) => handleChange(event.target.value, event.target)}
        onFocus={() => {
          setIsFocused(true);
          onTextFocus?.();
        }}
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
      onBlur={() => {
        setIsFocused(false);
        onTextBlur?.();
      }}
      onChange={(event) => handleChange(event.target.value, event.target)}
      onFocus={() => {
        setIsFocused(true);
        onTextFocus?.();
      }}
      onKeyDown={handleKeyDown}
      placeholder={showPlaceholder ? placeholder : undefined}
      ref={assignFieldRef}
      type="text"
      value={value}
    />
  );
}
