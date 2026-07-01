import { type RefObject, useEffect, useRef } from "react";

import { useBlockActionsMenu } from "@/components/canvas/block-actions-menu.tsx";
import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { useDragState } from "@/components/dnd/use-dnd.ts";
import { isContainerBlockType } from "@/lib/blocks/block-defs.ts";
import { findRowById } from "@/lib/blocks/block-tree.ts";
import { collectCanvasRowRects } from "@/lib/canvas/resolve-drop-target.ts";
import { resolveOverclickRowFromPointer } from "@/lib/canvas/resolve-overclick-row.ts";

const INTERACTIVE_SELECTOR =
  "input, textarea, [contenteditable], button, a, [role='button'], [data-canvas-row-select], [data-canvas-row-menu]";

/** True when `target` is inside a nested canvas row (list item, column child, etc.). */
function isNestedRowShellTarget(
  layout: HTMLElement,
  target: EventTarget | null
): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  const rowShell = layout.closest("[data-canvas-row-shell]");
  const hoveredShell = target.closest("[data-canvas-row-shell]");
  return (
    hoveredShell !== null &&
    rowShell !== null &&
    hoveredShell !== rowShell &&
    rowShell.contains(hoveredShell)
  );
}

function isOverclickZone(target: Element): boolean {
  return (
    target.closest("[data-canvas-drop-zone]") !== null ||
    target.closest("[data-column-content]") !== null ||
    target.closest("[data-canvas-row-content]") !== null
  );
}

function blurActiveField(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
}

/**
 * Capture-phase overclick: empty space below block content, stretched column
 * dead space, and the page bottom focus the nearest row (caret in field).
 */
export function useCanvasOverclick(
  scrollRootRef: RefObject<HTMLElement | null>
): void {
  const { clearSelection, dispatch, getRows } = useCanvasEditorContext();
  const { setOpenRowId } = useBlockActionsMenu();
  const isDragging = useDragState((state) => state.draggingId != null);

  const isDraggingRef = useRef(isDragging);
  isDraggingRef.current = isDragging;

  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root) {
      return;
    }

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: pointer routing branches on container depth and drag state
    const handleMouseDownCapture = (event: MouseEvent) => {
      if (event.button !== 0 || isDraggingRef.current) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest(INTERACTIVE_SELECTOR)) {
        return;
      }

      if (!isOverclickZone(target)) {
        return;
      }

      const rows = getRows();
      let rowId: string | null = null;

      const rowContent = target.closest("[data-canvas-row-content]");
      if (rowContent instanceof HTMLElement) {
        const isNested = isNestedRowShellTarget(rowContent, target);
        if (!isNested) {
          const shell = rowContent.closest("[data-canvas-row-shell]");
          const shellRowId = shell?.getAttribute("data-canvas-row-id");
          if (shellRowId) {
            const row = findRowById(rows, shellRowId);
            if (row && !isContainerBlockType(row.effectiveBlock.type)) {
              rowId = shellRowId;
            }
          }
        }
      }

      if (!rowId) {
        rowId = resolveOverclickRowFromPointer(
          rows,
          event.clientX,
          event.clientY,
          collectCanvasRowRects()
        );
      }

      if (!rowId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      blurActiveField();
      setOpenRowId(null);
      clearSelection();
      dispatch({
        type: "focus.set",
        rowId,
        placement: "end",
      });
    };

    root.addEventListener("mousedown", handleMouseDownCapture, true);
    return () => {
      root.removeEventListener("mousedown", handleMouseDownCapture, true);
    };
  }, [clearSelection, dispatch, getRows, scrollRootRef, setOpenRowId]);
}
