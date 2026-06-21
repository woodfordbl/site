import { useCallback, useEffect, useRef, useState } from "react";

import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import {
  computeTableColumnResizeWidths,
  DEFAULT_TABLE_COLUMN_WIDTH,
  resolveTableColumnWidthsPx,
} from "@/lib/canvas/table-layout.ts";

interface UseTableColumnResizeOptions {
  columnWidths: number[];
  tableId: string;
}

export function useTableColumnResize({
  tableId,
  columnWidths,
}: UseTableColumnResizeOptions) {
  const { dispatch } = useCanvasEditorContext();
  const [liveWidths, setLiveWidths] = useState<number[] | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    },
    []
  );

  const startResize = useCallback(
    (
      leftIndex: number,
      _rightIndex: number,
      event: React.PointerEvent<HTMLButtonElement>
    ) => {
      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const baselineWidths = resolveTableColumnWidthsPx(columnWidths);
      const handleEl = event.currentTarget as HTMLElement;

      setLiveWidths(baselineWidths);
      handleEl.setPointerCapture(event.pointerId);

      let pendingDelta = 0;

      const flushMove = () => {
        rafRef.current = null;
        setLiveWidths(
          computeTableColumnResizeWidths({
            columnWidths: baselineWidths,
            columnIndex: leftIndex,
            deltaPx: pendingDelta,
          })
        );
      };

      const onMove = (moveEvent: PointerEvent) => {
        pendingDelta = moveEvent.clientX - startX;
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
        setLiveWidths(null);
      };

      const onUp = (upEvent: PointerEvent) => {
        teardown(upEvent.pointerId);
        const nextWidths = computeTableColumnResizeWidths({
          columnWidths: baselineWidths,
          columnIndex: leftIndex,
          deltaPx: upEvent.clientX - startX,
        });
        dispatch({
          type: "table.updateColumnWidths",
          tableId,
          columnWidths: nextWidths,
        });
      };

      const onCancel = (cancelEvent: PointerEvent) => {
        teardown(cancelEvent.pointerId);
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onCancel);
    },
    [columnWidths, dispatch, tableId]
  );

  return { startResize, liveWidths };
}

export function tableColumnWidthAt(widths: number[], index: number): number {
  return (
    resolveTableColumnWidthsPx(widths)[index] ?? DEFAULT_TABLE_COLUMN_WIDTH
  );
}
