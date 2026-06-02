import type { CanvasClipboardPayload } from "@/lib/canvas/clipboard.ts";
import { handleBlockModifierArrowKeyDown } from "@/lib/editor/field-keydown.ts";

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

function isBlockFieldFocused(event?: KeyboardEvent): boolean {
  const active = event?.target ?? document.activeElement;
  return (
    active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
  );
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

export function handleCanvasKeyboardShortcut(
  event: KeyboardEvent,
  handlers: CanvasKeyboardHandlers
): void {
  if (isBlockFieldFocused(event)) {
    return;
  }

  if (handleCanvasSelectionArrowKeyDown(event, handlers)) {
    return;
  }

  const mod = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();

  if (mod && key === "a") {
    event.preventDefault();
    handlers.selectAll();
    return;
  }

  if (mod && key === "c" && handlers.selectedCount > 0) {
    event.preventDefault();
    handlers.copySelection().catch(() => undefined);
    return;
  }

  if (
    (event.key === "Backspace" || event.key === "Delete") &&
    handlers.selectedCount > 0
  ) {
    event.preventDefault();
    handlers.deleteSelection();
  }
}

export function handleCanvasPasteEvent(
  event: ClipboardEvent,
  handlers: CanvasKeyboardHandlers
): void {
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
