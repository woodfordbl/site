import { useEffect, useRef } from "react";

interface UseCanvasKeyboardOptions {
  clearSelection: () => void;
  hasSelection: boolean;
  onPaste: (event: ClipboardEvent) => void;
}

/**
 * Canvas-level pointer/clipboard wiring that isn't keyboard-shortcut dispatch.
 * Keyboard shortcuts (select/copy/delete, move/extend row, clear selection) are
 * registered via {@link useCommandHotkeys} in the canvas editor; this hook keeps
 * the native `paste` ClipboardEvent (block paste reads app clipboard state) and
 * the click-outside-to-clear-selection behavior.
 */
export function useCanvasKeyboard({
  onPaste,
  clearSelection,
  hasSelection,
}: UseCanvasKeyboardOptions) {
  const onPasteRef = useRef(onPaste);
  const clearSelectionRef = useRef(clearSelection);

  onPasteRef.current = onPaste;
  clearSelectionRef.current = clearSelection;

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      onPasteRef.current(event);
    };

    window.addEventListener("paste", handlePaste, { capture: true });
    return () => {
      window.removeEventListener("paste", handlePaste, { capture: true });
    };
  }, []);

  useEffect(() => {
    if (!hasSelection) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (event.shiftKey && target.closest("[data-canvas-row-content]")) {
        return;
      }
      if (target.closest("[data-canvas-row-select]")) {
        return;
      }
      if (target.closest("[data-canvas-row-menu]")) {
        return;
      }
      if (target.closest("[data-canvas-drop-zone]")) {
        return;
      }
      if (target.closest("[data-column-content]")) {
        return;
      }
      clearSelectionRef.current();
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [hasSelection]);
}
