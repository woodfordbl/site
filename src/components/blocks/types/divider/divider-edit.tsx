import { useCallback, useRef } from "react";

import { useAutoFocus } from "@/hooks/use-auto-focus.ts";
import { useInlineCustomBlockKeys } from "@/hooks/use-inline-custom-block-keys.ts";
import type { BlockEditProps } from "@/lib/canvas/block-spec.types.ts";
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

  const applyAutoFocus = useCallback(() => {
    focusRef.current?.focus();
  }, []);

  useAutoFocus({
    enabled: autoFocus,
    onFocus: applyAutoFocus,
    onHandled: onAutoFocusHandled,
  });

  const handleKeyDown = useInlineCustomBlockKeys({
    onEnter,
    onExtendSelectionDown,
    onExtendSelectionUp,
    onMoveRowDown,
    onMoveRowUp,
    onNavigateDown,
    onNavigateUp,
    onStructuralKey,
  });

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
