import { useEffect, useRef } from "react";
import type { CanvasSelectionArrowHandlers } from "@/lib/canvas/canvas-keyboard-shortcuts.ts";
import { handleCanvasSelectionArrowKeyDown } from "@/lib/canvas/canvas-keyboard-shortcuts.ts";

interface UseCanvasKeyboardOptions {
  clearSelection: () => void;
  hasSelection: boolean;
  onKeyDown: (event: KeyboardEvent) => void;
  onPaste: (event: ClipboardEvent) => void;
  selectionArrowHandlers?: CanvasSelectionArrowHandlers;
}

export function useCanvasKeyboard({
  onKeyDown,
  onPaste,
  clearSelection,
  hasSelection,
  selectionArrowHandlers,
}: UseCanvasKeyboardOptions) {
  const onKeyDownRef = useRef(onKeyDown);
  const onPasteRef = useRef(onPaste);
  const clearSelectionRef = useRef(clearSelection);
  const selectionArrowHandlersRef = useRef(selectionArrowHandlers);

  onKeyDownRef.current = onKeyDown;
  onPasteRef.current = onPaste;
  clearSelectionRef.current = clearSelection;
  selectionArrowHandlersRef.current = selectionArrowHandlers;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearSelectionRef.current();
      }

      onKeyDownRef.current(event);
    };

    const handlePaste = (event: ClipboardEvent) => {
      onPasteRef.current(event);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("paste", handlePaste, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("paste", handlePaste, { capture: true });
    };
  }, []);

  useEffect(() => {
    if (!hasSelection) {
      return;
    }

    const handleSelectionArrowCapture = (event: KeyboardEvent) => {
      const handlers = selectionArrowHandlersRef.current;
      if (!handlers) {
        return;
      }
      handleCanvasSelectionArrowKeyDown(event, handlers);
    };

    window.addEventListener("keydown", handleSelectionArrowCapture, {
      capture: true,
    });
    return () => {
      window.removeEventListener("keydown", handleSelectionArrowCapture, {
        capture: true,
      });
    };
  }, [hasSelection]);

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
      clearSelectionRef.current();
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [hasSelection]);
}
