import { useCallback, useEffect, useRef, useState } from "react";

import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import {
  computeColumnResizeWidths,
  DEFAULT_COLUMN_WIDTH,
} from "@/lib/canvas/columns-layout.ts";
import type { Block } from "@/lib/schemas/block.ts";

interface UseColumnResizeOptions {
  columnRows: CanvasRow[];
}

export function useColumnResize({ columnRows }: UseColumnResizeOptions) {
  const { dispatchCommands } = useCanvasEditorContext();
  const [liveWidths, setLiveWidths] = useState<Record<string, number> | null>(
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

  const startResize = useCallback(
    (
      leftColumnId: string,
      rightColumnId: string,
      event: React.PointerEvent
    ) => {
      event.preventDefault();
      event.stopPropagation();

      const leftRow = columnRows.find((r) => r.rowId === leftColumnId);
      const rightRow = columnRows.find((r) => r.rowId === rightColumnId);
      if (!(leftRow && rightRow)) {
        return;
      }

      const leftBlock = leftRow.effectiveBlock;
      const rightBlock = rightRow.effectiveBlock;
      if (leftBlock.type !== "column" || rightBlock.type !== "column") {
        return;
      }

      const startX = event.clientX;
      const startLeft = leftBlock.props.width ?? DEFAULT_COLUMN_WIDTH;
      const startRight = rightBlock.props.width ?? DEFAULT_COLUMN_WIDTH;
      const pairTotal = startLeft + startRight;
      const allWidths = columnRows.map((r) => {
        const b = r.effectiveBlock;
        return b.type === "column"
          ? (b.props.width ?? DEFAULT_COLUMN_WIDTH)
          : DEFAULT_COLUMN_WIDTH;
      });
      const flexSumAll = allWidths.reduce((a, w) => a + w, 0);
      const baselineWidths = Object.fromEntries(
        columnRows.map((r, index) => [
          r.rowId,
          allWidths[index] ?? DEFAULT_COLUMN_WIDTH,
        ])
      );

      const handleEl = event.currentTarget as HTMLElement;
      // The container cannot change width mid-drag; measure once.
      const containerWidth =
        handleEl.closest("[data-columns-layout]")?.getBoundingClientRect()
          .width ?? 1;

      const widthsForDelta = (deltaPx: number) =>
        computeColumnResizeWidths({
          containerWidthPx: containerWidth,
          deltaPx,
          flexSumAll,
          pairTotal,
          startLeftWidth: startLeft,
        });

      setLiveWidths(baselineWidths);
      handleEl.setPointerCapture(event.pointerId);

      let pendingDelta = 0;

      const flushMove = () => {
        rafRef.current = null;
        const { leftWidth, rightWidth } = widthsForDelta(pendingDelta);
        setLiveWidths((current) => ({
          ...(current ?? baselineWidths),
          [leftColumnId]: leftWidth,
          [rightColumnId]: rightWidth,
        }));
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

        const { leftWidth, rightWidth } = widthsForDelta(
          upEvent.clientX - startX
        );

        // Both column updates in one transaction: one commit, one undo step.
        dispatchCommands([
          {
            type: "row.update",
            rowId: leftColumnId,
            block: {
              ...leftBlock,
              props: { ...leftBlock.props, width: leftWidth },
            },
          },
          {
            type: "row.update",
            rowId: rightColumnId,
            block: {
              ...rightBlock,
              props: { ...rightBlock.props, width: rightWidth },
            },
          },
        ]);
      };

      const onCancel = (cancelEvent: PointerEvent) => {
        teardown(cancelEvent.pointerId);
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onCancel);
    },
    [columnRows, dispatchCommands]
  );

  return { startResize, liveWidths };
}

export function columnBlockWidth(block: Block): number {
  if (block.type !== "column") {
    return DEFAULT_COLUMN_WIDTH;
  }
  return block.props.width ?? DEFAULT_COLUMN_WIDTH;
}
