import { useCallback } from "react";

import type { BlockEditKeyboardProps } from "@/lib/editor/block-edit-props.ts";
import { handleBlockModifierArrowKeyDown } from "@/lib/editor/field-keydown.ts";

type InlineCustomBlockKeyHandlers = Pick<
  BlockEditKeyboardProps,
  | "onEnter"
  | "onExtendSelectionDown"
  | "onExtendSelectionUp"
  | "onMoveRowDown"
  | "onMoveRowUp"
  | "onNavigateDown"
  | "onNavigateUp"
  | "onStructuralKey"
>;

/**
 * Shared keydown handling for inline-custom blocks (divider, page link,
 * media, embed) whose focus target is a non-text element: modifier arrows
 * move/extend, plain arrows navigate rows, Backspace/Delete remove the row,
 * and Enter (when wired) inserts after.
 */
export function useInlineCustomBlockKeys({
  onEnter,
  onExtendSelectionDown,
  onExtendSelectionUp,
  onMoveRowDown,
  onMoveRowUp,
  onNavigateDown,
  onNavigateUp,
  onStructuralKey,
}: InlineCustomBlockKeyHandlers) {
  return useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (
        handleBlockModifierArrowKeyDown(event, {
          onExtendSelectionDown,
          onExtendSelectionUp,
          onMoveRowDown,
          onMoveRowUp,
        })
      ) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        onNavigateDown?.();
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        onNavigateUp?.();
        return;
      }

      if (event.key === "Enter" && onEnter) {
        event.preventDefault();
        onEnter({ start: 0, end: 0 });
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        onStructuralKey?.(true, event.key);
      }
    },
    [
      onEnter,
      onExtendSelectionDown,
      onExtendSelectionUp,
      onMoveRowDown,
      onMoveRowUp,
      onNavigateDown,
      onNavigateUp,
      onStructuralKey,
    ]
  );
}
