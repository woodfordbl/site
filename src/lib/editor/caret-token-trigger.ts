/**
 * Pure helpers for canvas caret triggers (`@` mentions, `#` formulas): read
 * the active rich-text field's unclosed trigger run from the serialized model
 * (not a single DOM text node), anchor a popover under the caret, and replace
 * that run. Deliberately outside the slash-menu pipeline.
 */

import {
  getFieldSelection,
  getFieldValue,
  isRichTextField,
} from "@/lib/editor/caret-navigation.ts";
import { setRichTextSelection } from "@/lib/editor/rich-text-dom.ts";

/** Query longer than this can't be a token-in-progress — stop offering. */
export const CARET_TOKEN_MAX_QUERY_LENGTH = 40;

/** Collapsed caret run for a single-character trigger (`@` / `#`). */
export interface CaretTokenContext {
  /** Caret / end of the typed query in model offsets. */
  end: number;
  field: HTMLElement;
  query: string;
  /** Offset of the trigger character in the field's serialized text. */
  start: number;
  trigger: string;
}

export type CaretTokenPickerKeyAction = "close" | "confirm" | "down" | "up";

const WHITESPACE_RE = /\s/;

/**
 * True when `index` is the start of the text or the prior character is
 * whitespace — `@`/`#` mid-word (e.g. email) stay plain text.
 */
function isTriggerBoundary(text: string, index: number): boolean {
  if (index <= 0) {
    return true;
  }
  return WHITESPACE_RE.test(text.charAt(index - 1));
}

/**
 * The caret's unclosed single-char trigger run inside a rich-text canvas
 * field, or null. Uses the serialized field value so marks/chrome do not
 * break detection the way a single DOM text node can.
 */
export function readCaretTokenContext(
  trigger: string
): CaretTokenContext | null {
  if (trigger.length !== 1) {
    return null;
  }
  const active = document.activeElement;
  if (!(active && isRichTextField(active))) {
    return null;
  }
  const selection = getFieldSelection(active);
  if (selection.start !== selection.end) {
    return null;
  }

  const value = getFieldValue(active);
  const upToCaret = value.slice(0, selection.start);
  const start = upToCaret.lastIndexOf(trigger);
  if (start === -1 || !isTriggerBoundary(upToCaret, start)) {
    return null;
  }
  const typed = upToCaret.slice(start + 1);
  if (
    typed.includes(trigger) ||
    WHITESPACE_RE.test(typed) ||
    typed.length > CARET_TOKEN_MAX_QUERY_LENGTH
  ) {
    return null;
  }
  return {
    field: active,
    start,
    end: selection.start,
    query: typed,
    trigger,
  };
}

/** Viewport rect to anchor a popover under (caret, or field as fallback). */
export function readCaretAnchorRect(): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (rect.width > 0 || rect.height > 0) {
    return rect;
  }
  const active = document.activeElement;
  return active instanceof HTMLElement ? active.getBoundingClientRect() : null;
}

/**
 * Select the trigger run in the field so a subsequent DOM insert replaces
 * `@query` / `#…`.
 */
export function selectCaretTokenRange(context: CaretTokenContext): boolean {
  if (!document.contains(context.field)) {
    return false;
  }
  context.field.focus();
  setRichTextSelection(context.field, {
    start: context.start,
    end: context.end,
  });
  return true;
}

/**
 * Replace the selected trigger run with plain text via `insertText` so the
 * rich-text field's input path + undo behave like typing.
 */
export function replaceCaretTokenWithText(
  context: CaretTokenContext,
  text: string
): boolean {
  if (!selectCaretTokenRange(context)) {
    return false;
  }
  return document.execCommand("insertText", false, text);
}

/**
 * Notify the rich-text field that its DOM changed outside the normal typing
 * path (e.g. after inserting an inline page-link anchor).
 */
export function dispatchRichTextInput(field: HTMLElement): void {
  field.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertReplacementText",
    })
  );
}

/** Keys an open listbox-style picker owns; everything else passes through. */
export function caretTokenPickerKeyAction(
  key: string
): CaretTokenPickerKeyAction | null {
  switch (key) {
    case "Escape":
      return "close";
    case "Enter":
    case "Tab":
      return "confirm";
    case "ArrowDown":
      return "down";
    case "ArrowUp":
      return "up";
    default:
      return null;
  }
}

/** Next highlight in `direction`, wrapping; undefined when empty. */
export function stepCaretTokenHighlight<T extends { key: string }>(
  enabledOptions: readonly T[],
  highlighted: T | undefined,
  direction: "down" | "up"
): T | undefined {
  if (enabledOptions.length === 0) {
    return;
  }
  const index = highlighted
    ? enabledOptions.findIndex((option) => option.key === highlighted.key)
    : 0;
  const delta = direction === "down" ? 1 : -1;
  return enabledOptions[
    (index + delta + enabledOptions.length) % enabledOptions.length
  ];
}
