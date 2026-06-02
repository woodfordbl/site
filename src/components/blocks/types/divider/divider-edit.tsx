import { useCallback, useEffect, useRef } from "react";

import type { BlockEditProps } from "@/lib/canvas/block-spec.types.ts";
import { handleBlockModifierArrowKeyDown } from "@/lib/editor/field-keydown.ts";
import { cn } from "@/lib/utils.ts";

type DividerEditProps = BlockEditProps<"divider">;

export function DividerEdit({
  autoFocus,
  onAutoFocusHandled,
  onEnter,
  onExtendSelectionDown,
  onExtendSelectionUp,
  onMoveRowDown,
  onMoveRowUp,
  onNavigateDown,
  onNavigateUp,
  onStructuralKey,
}: DividerEditProps) {
  const focusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!autoFocus) {
      return;
    }

    focusRef.current?.focus();
    onAutoFocusHandled?.();
  }, [autoFocus, onAutoFocusHandled]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
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

      if (event.key === "Enter") {
        event.preventDefault();
        onEnter?.({ start: 0, end: 0 });
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

  return (
    <button
      aria-label="Divider"
      className={cn(
        "flex w-full items-center rounded-sm border-0 bg-transparent p-0 text-left outline-none"
      )}
      onKeyDown={handleKeyDown}
      ref={focusRef}
      type="button"
    >
      <hr className="my-0 w-full border-0 border-border border-t" />
    </button>
  );
}
