import type { CanvasClipboardPayload } from "@/lib/canvas/clipboard.ts";
import {
  extractPrimaryPastedUrl,
  hasNonCollapsedCanvasFieldSelection,
} from "@/lib/canvas/paste-url.ts";
import { isCanvasTextField } from "@/lib/editor/caret-navigation.ts";
import { handleBlockModifierArrowKeyDown } from "@/lib/editor/field-keydown.ts";
import { extractMediaFiles } from "@/lib/media/paste-media.ts";

export interface CanvasSelectionArrowHandlers {
  extendSelectionDown?: () => void;
  extendSelectionUp?: () => void;
  moveRowDown?: () => void;
  moveRowUp?: () => void;
  selectedCount: number;
}

export interface CanvasKeyboardHandlers extends CanvasSelectionArrowHandlers {
  clipboard: CanvasClipboardPayload | null;
  copySelection: () => Promise<void>;
  deleteSelection: () => void;
  pasteClipboard: () => void;
  selectAll: () => void;
}

export interface CanvasPasteHandlers extends CanvasKeyboardHandlers {
  /** Stores pasted image/video files as assets and inserts media blocks. */
  insertMediaFiles: (files: File[]) => void;
  /**
   * Same-origin page URL paste. Returns true when claimed as a `pageLink` block
   * (empty-row convert or insert-after). Returns false for inline page links so
   * the rich-text field can insert a `link` mark with `pageId`.
   */
  tryPastePageLink?: (url: string) => boolean;
}

function isBlockFieldFocused(event?: KeyboardEvent): boolean {
  const active = event?.target ?? document.activeElement;
  return (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    (active instanceof Element && isCanvasTextField(active))
  );
}

/**
 * True when focus sits in an editable field that is NOT part of a canvas block
 * row (page title, dialogs, sidebar rename). Canvas undo/redo must skip these
 * and leave the keystroke to the browser's own default behavior.
 */
export function isNonCanvasEditableFocused(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) {
    return false;
  }
  const editable =
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active.isContentEditable;
  return editable && active.closest("[data-canvas-row-shell]") == null;
}

export function handleCanvasSelectionArrowKeyDown(
  event: KeyboardEvent,
  handlers: CanvasSelectionArrowHandlers
): boolean {
  if (handlers.selectedCount === 0 || isBlockFieldFocused(event)) {
    return false;
  }

  const handled = handleBlockModifierArrowKeyDown(event, {
    onExtendSelectionDown: handlers.extendSelectionDown,
    onExtendSelectionUp: handlers.extendSelectionUp,
    onMoveRowDown: handlers.moveRowDown,
    onMoveRowUp: handlers.moveRowUp,
  });
  if (handled) {
    event.stopPropagation();
  }
  return handled;
}

/**
 * Canvas-level Mod+A. Block selection replaces the browser's document select
 * all, so the keystroke is claimed and any live range is dropped — otherwise a
 * native text highlight stays painted under the block selection chrome. With a
 * block field focused the keystroke belongs to that field's own select all.
 */
export function handleSelectAllBlocksKeyDown(
  event: KeyboardEvent,
  selectAll: () => void
): void {
  if (isBlockFieldFocused(event)) {
    return;
  }

  event.preventDefault();
  window.getSelection()?.removeAllRanges();
  selectAll();
}

export function handleCanvasPasteEvent(
  event: ClipboardEvent,
  handlers: CanvasPasteHandlers
): void {
  // Image/video paste renders as a media block — including while a text field
  // is focused (e.g. pasting a screenshot mid-paragraph), so it runs before the
  // field-focus guard that defers plain-text paste to the browser.
  const mediaFiles = extractMediaFiles(event.clipboardData);
  if (mediaFiles.length > 0) {
    event.preventDefault();
    event.stopPropagation();
    handlers.insertMediaFiles(mediaFiles);
    return;
  }

  // Same-origin page URLs: empty text rows convert to a `pageLink` block;
  // non-empty rich-text fields insert an inline page link (tryPastePageLink
  // returns false so RichTextArea handles it). A non-collapsed selection always
  // wraps as an inline link instead.
  const primaryUrl = extractPrimaryPastedUrl(event.clipboardData);
  if (
    primaryUrl &&
    handlers.tryPastePageLink &&
    !hasNonCollapsedCanvasFieldSelection() &&
    handlers.tryPastePageLink(primaryUrl)
  ) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  if (isBlockFieldFocused()) {
    return;
  }

  if ((handlers.clipboard?.blocks.length ?? 0) === 0) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  handlers.pasteClipboard();
}
