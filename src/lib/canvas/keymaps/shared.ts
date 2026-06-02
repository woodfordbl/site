import type { KeyboardEvent } from "react";

import type {
  FieldContext,
  FieldKeymap,
  KeymapResult,
} from "@/lib/canvas/keymaps/types.ts";

export const defaultFieldKeymap: FieldKeymap = (event, ctx) => {
  if (event.key !== "Backspace" && event.key !== "Delete") {
    return { handled: false };
  }

  const field = event.currentTarget;
  const caretAtStart = field.selectionStart === 0 && field.selectionEnd === 0;

  if (!(caretAtStart || ctx.isEmpty)) {
    return { handled: false };
  }

  return {
    handled: true,
    caretAtStart,
    key: event.key as "Backspace" | "Delete",
  };
};

export function runKeymapPipeline(
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ctx: FieldContext,
  keymaps: FieldKeymap[]
): KeymapResult {
  for (const keymap of keymaps) {
    const result = keymap(event, ctx);
    if (result.handled) {
      return result;
    }
  }
  return { handled: false };
}
