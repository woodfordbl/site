import { useCallback, useEffect, useRef, useState } from "react";

import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { MIN_TABLE_ROW_HEIGHT_PX } from "@/lib/canvas/table-layout.ts";

interface LiveRowHeight {
  height: number;
  tableRowId: string;
}

/**
 * Pointer-driven vertical resize for a single table row. Mirrors
 * {@link useTableColumnResize}: tracks a live height during the drag (batched via
 * rAF) and persists it on pointer-up. Only one row resizes at a time, so the
 * live value is a single `{ tableRowId, height }`.
 */
export function useTableRowResize() {
  const { dispatch } = useCanvasEditorContext();
  const [liveRowHeight, setLiveRowHeight] = useState<LiveRowHeight | null>(
    null
  );
  const rafRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    },
    []
  );

  const startRowResize = useCallback(
    (tableRowId: string, event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const startY = event.clientY;
      const handleEl = event.currentTarget as HTMLElement;
      const rowEl = handleEl.closest<HTMLElement>("[data-table-row-id]");
      const baselineHeight = Math.max(
        MIN_TABLE_ROW_HEIGHT_PX,
        Math.round(
          rowEl?.getBoundingClientRect().height ?? MIN_TABLE_ROW_HEIGHT_PX
        )
      );

      setLiveRowHeight({ tableRowId, height: baselineHeight });
      handleEl.setPointerCapture(event.pointerId);

      let pendingDelta = 0;

      const nextHeight = (delta: number) =>
        Math.max(MIN_TABLE_ROW_HEIGHT_PX, baselineHeight + delta);

      const flushMove = () => {
        rafRef.current = null;
        setLiveRowHeight({ tableRowId, height: nextHeight(pendingDelta) });
      };

      const onMove = (moveEvent: PointerEvent) => {
        pendingDelta = moveEvent.clientY - startY;
        rafRef.current ??= requestAnimationFrame(flushMove);
      };

      const teardown = (pointerId: number) => {
        if (handleEl.hasPointerCapture(pointerId)) {
          handleEl.releasePointerCapture(pointerId);
        }
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onCancel);
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        setLiveRowHeight(null);
      };

      const onUp = (upEvent: PointerEvent) => {
        teardown(upEvent.pointerId);
        dispatch({
          type: "table.updateRowHeight",
          tableRowId,
          height: nextHeight(upEvent.clientY - startY),
        });
      };

      const onCancel = (cancelEvent: PointerEvent) => {
        teardown(cancelEvent.pointerId);
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onCancel);
    },
    [dispatch]
  );

  return { startRowResize, liveRowHeight };
}
