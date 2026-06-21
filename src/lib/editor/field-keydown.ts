import type { KeyboardEvent } from "react";

import { MAX_BLOCK_INDENT } from "@/lib/blocks/block-indent.ts";
import {
  shouldNavigateDownFromField,
  shouldNavigateUpFromField,
} from "@/lib/editor/caret-navigation.ts";

interface SlashMenuKeyHandlers {
  onClose?: () => void;
  onConfirm?: () => void;
  onDismiss?: () => void;
  onLinkBack?: () => void;
  onNavigate?: (direction: "up" | "down") => void;
  phase?: "root" | "link";
}

export function handleSlashMenuKeyDown(
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  handlers: SlashMenuKeyHandlers
): boolean {
  if (handlers.phase === "link") {
    if (event.key === "Escape") {
      event.preventDefault();
      handlers.onLinkBack?.();
      return true;
    }
    return false;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    handlers.onNavigate?.("down");
    return true;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    handlers.onNavigate?.("up");
    return true;
  }

  if (event.key === "Enter" && !event.shiftKey && handlers.onConfirm) {
    event.preventDefault();
    handlers.onConfirm();
    return true;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    if (handlers.onDismiss) {
      handlers.onDismiss();
    } else {
      handlers.onClose?.();
    }
    return true;
  }

  return false;
}

interface BlockModifierArrowHandlers {
  onExtendSelectionDown?: () => void;
  onExtendSelectionUp?: () => void;
  onMoveRowDown?: () => void;
  onMoveRowUp?: () => void;
}

interface ModifierArrowKeyEvent {
  altKey: boolean;
  key: string;
  preventDefault: () => void;
  shiftKey: boolean;
}

export function handleBlockModifierArrowKeyDown(
  event: ModifierArrowKeyEvent,
  handlers: BlockModifierArrowHandlers
): boolean {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
    return false;
  }

  const direction = event.key === "ArrowUp" ? "up" : "down";

  if (event.shiftKey) {
    const handler =
      direction === "up"
        ? handlers.onExtendSelectionUp
        : handlers.onExtendSelectionDown;
    if (!handler) {
      return false;
    }
    event.preventDefault();
    handler();
    return true;
  }

  if (event.altKey) {
    const handler =
      direction === "up" ? handlers.onMoveRowUp : handlers.onMoveRowDown;
    if (!handler) {
      return false;
    }
    event.preventDefault();
    handler();
    return true;
  }

  return false;
}

export function handleBlockArrowKeyDown(
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  handlers: {
    onNavigateDown?: () => void;
    onNavigateUp?: () => void;
  }
): boolean {
  const field = event.currentTarget;

  if (event.key === "ArrowUp" && handlers.onNavigateUp) {
    if (!shouldNavigateUpFromField(field)) {
      return false;
    }
    event.preventDefault();
    handlers.onNavigateUp();
    return true;
  }

  if (event.key === "ArrowDown" && handlers.onNavigateDown) {
    if (!shouldNavigateDownFromField(field)) {
      return false;
    }
    event.preventDefault();
    handlers.onNavigateDown();
    return true;
  }

  return false;
}

interface BlockIndentKeyHandlers {
  indent: number;
  onIndentChange?: (indent: number) => void;
}

export function handleBlockIndentKeyDown(
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  handlers: BlockIndentKeyHandlers
): boolean {
  if (!handlers.onIndentChange) {
    return false;
  }

  const field = event.currentTarget;

  if (event.key === "Tab") {
    event.preventDefault();
    const delta = event.shiftKey ? -1 : 1;
    handlers.onIndentChange(
      Math.min(MAX_BLOCK_INDENT, Math.max(0, handlers.indent + delta))
    );
    return true;
  }

  if (
    event.key === "Backspace" &&
    field.selectionStart === 0 &&
    field.selectionEnd === 0 &&
    handlers.indent > 0
  ) {
    event.preventDefault();
    handlers.onIndentChange(handlers.indent - 1);
    return true;
  }

  return false;
}

export type StructuralDeleteKeyResult =
  | { handled: true; caretAtStart: boolean; key: "Backspace" | "Delete" }
  | { handled: false };

/** Backspace/Delete becomes a structural command when the caret is at start or the block is empty. */
export function resolveStructuralDeleteKey(
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  isEmpty: boolean
): StructuralDeleteKeyResult {
  if (event.key !== "Backspace" && event.key !== "Delete") {
    return { handled: false };
  }

  const field = event.currentTarget;
  const caretAtStart = field.selectionStart === 0 && field.selectionEnd === 0;

  if (!(caretAtStart || isEmpty)) {
    return { handled: false };
  }

  return { handled: true, caretAtStart, key: event.key };
}

export function handleEmptyDeleteKeyDown(
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  isEmpty: boolean,
  onDeleteWhenEmpty?: () => void
): boolean {
  if (
    (event.key === "Backspace" || event.key === "Delete") &&
    isEmpty &&
    onDeleteWhenEmpty
  ) {
    event.preventDefault();
    onDeleteWhenEmpty();
    return true;
  }

  return false;
}
