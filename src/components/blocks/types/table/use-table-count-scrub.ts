import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useRef, useState } from "react";

import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { useHaptics } from "@/hooks/haptics.ts";
import { POINTER_CLICK_DRAG_THRESHOLD_PX } from "@/hooks/use-pointer-click-vs-drag.ts";
import { type CanvasRow, findRowById } from "@/lib/blocks/block-tree.ts";
import {
  clampTableColumnCount,
  clampTableRowCount,
  computeTableScrubDelta,
  DEFAULT_TABLE_COLUMN_WIDTH,
  deriveTableGrid,
} from "@/lib/canvas/table-layout.ts";

const DEFAULT_TABLE_ROW_STEP_PX = 36;

type TableCountScrubAxis = "column" | "row";

interface UseTableCountScrubOptions {
  axis: TableCountScrubAxis;
  baselineCount: number;
  onClickAdd: () => void;
  tableId: string;
}

function measureTableRowStepPx(tableId: string): number {
  const tableEl = document.querySelector(
    `[data-table-id="${CSS.escape(tableId)}"]`
  );
  const rowElements = tableEl?.querySelectorAll("[data-table-row-id]");
  const lastRow = rowElements?.[rowElements.length - 1];
  if (!lastRow) {
    return DEFAULT_TABLE_ROW_STEP_PX;
  }

  const height = lastRow.getBoundingClientRect().height;
  return height > 0 ? height : DEFAULT_TABLE_ROW_STEP_PX;
}

function getTableGridFromRows(rows: CanvasRow[], tableId: string) {
  const tableRow = findRowById(rows, tableId);
  if (!tableRow) {
    return null;
  }

  return deriveTableGrid(tableRow);
}

type TableCountDispatch = ReturnType<typeof useCanvasEditorContext>["dispatch"];

function addOneTableCountUnit(
  axis: TableCountScrubAxis,
  dispatch: TableCountDispatch,
  getRows: () => CanvasRow[],
  tableId: string
): boolean {
  const grid = getTableGridFromRows(getRows(), tableId);
  if (!grid) {
    return false;
  }

  if (axis === "row") {
    const lastRowId = grid.rows.at(-1)?.rowId;
    if (!lastRowId) {
      return false;
    }

    dispatch({
      type: "table.addRow",
      tableRowId: lastRowId,
      edge: "after",
      focus: false,
    });
    return true;
  }

  dispatch({
    type: "table.addColumn",
    tableId,
    columnIndex: grid.columnCount - 1,
    edge: "after",
    focus: false,
  });
  return true;
}

function removeOneTableCountUnit(
  axis: TableCountScrubAxis,
  dispatch: TableCountDispatch,
  getRows: () => CanvasRow[],
  tableId: string
): boolean {
  const grid = getTableGridFromRows(getRows(), tableId);
  if (!grid) {
    return false;
  }

  if (axis === "row") {
    const lastRowId = grid.rows.at(-1)?.rowId;
    if (!lastRowId) {
      return false;
    }

    dispatch({
      type: "table.removeRow",
      tableRowId: lastRowId,
    });
    return true;
  }

  dispatch({
    type: "table.removeColumn",
    tableId,
    columnIndex: grid.columnCount - 1,
  });
  return true;
}

/**
 * Pointer scrub on table trailing plus controls: click adds one row/column;
 * drag adjusts trailing count incrementally with live dispatch.
 */
export function useTableCountScrub({
  axis,
  baselineCount,
  onClickAdd,
  tableId,
}: UseTableCountScrubOptions) {
  const { dispatch, getRows } = useCanvasEditorContext();
  const haptic = useHaptics();
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [previewDelta, setPreviewDelta] = useState(0);

  const baselineCountRef = useRef(baselineCount);
  const didScrubRef = useRef(false);
  const lastTargetCountRef = useRef(baselineCount);
  const netAddedRef = useRef(0);
  const pointerOriginRef = useRef<{ x: number; y: number } | null>(null);
  const stepPxRef = useRef(
    axis === "column" ? DEFAULT_TABLE_COLUMN_WIDTH : DEFAULT_TABLE_ROW_STEP_PX
  );

  const resetPointerState = useCallback(() => {
    pointerOriginRef.current = null;
    didScrubRef.current = false;
    lastTargetCountRef.current = baselineCountRef.current;
    netAddedRef.current = 0;
    setIsScrubbing(false);
    setPreviewDelta(0);
  }, []);

  const getCurrentCount = useCallback(() => {
    const grid = getTableGridFromRows(getRows(), tableId);
    if (!grid) {
      return baselineCountRef.current;
    }

    return axis === "row" ? grid.rows.length : grid.columnCount;
  }, [axis, getRows, tableId]);

  const applyTargetCount = useCallback(
    (targetCount: number) => {
      let currentCount = getCurrentCount();

      while (currentCount < targetCount) {
        if (!addOneTableCountUnit(axis, dispatch, getRows, tableId)) {
          return;
        }
        netAddedRef.current += 1;
        currentCount = getCurrentCount();
      }

      while (currentCount > targetCount) {
        if (!removeOneTableCountUnit(axis, dispatch, getRows, tableId)) {
          return;
        }
        netAddedRef.current -= 1;
        currentCount = getCurrentCount();
      }
    },
    [axis, dispatch, getCurrentCount, getRows, tableId]
  );

  const focusTrailingCell = useCallback(() => {
    const grid = getTableGridFromRows(getRows(), tableId);
    if (!grid) {
      return;
    }

    const focusCellId =
      axis === "row"
        ? grid.rows.at(-1)?.cells[0]?.cellId
        : grid.rows[0]?.cells.at(-1)?.cellId;

    if (!focusCellId) {
      return;
    }

    dispatch({
      type: "focus.set",
      rowId: focusCellId,
      placement: "start",
    });
  }, [axis, dispatch, getRows, tableId]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return;
      }

      baselineCountRef.current = baselineCount;
      lastTargetCountRef.current = baselineCount;
      didScrubRef.current = false;
      netAddedRef.current = 0;
      setPreviewDelta(0);
      pointerOriginRef.current = {
        x: event.clientX,
        y: event.clientY,
      };
      stepPxRef.current =
        axis === "column"
          ? DEFAULT_TABLE_COLUMN_WIDTH
          : measureTableRowStepPx(tableId);

      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [axis, baselineCount, tableId]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const origin = pointerOriginRef.current;
      if (!origin) {
        return;
      }

      const deltaPx =
        axis === "row" ? event.clientY - origin.y : event.clientX - origin.x;

      if (Math.abs(deltaPx) <= POINTER_CLICK_DRAG_THRESHOLD_PX) {
        return;
      }

      didScrubRef.current = true;
      setIsScrubbing(true);

      const scrubDelta = computeTableScrubDelta(deltaPx, stepPxRef.current);
      const targetCount =
        axis === "row"
          ? clampTableRowCount(baselineCountRef.current + scrubDelta)
          : clampTableColumnCount(baselineCountRef.current + scrubDelta);

      if (targetCount === lastTargetCountRef.current) {
        return;
      }

      // Crossing a step adds or removes a row/column — a discrete, visible count
      // change. Tick once per step (the guard above means this is per step, not
      // per pointer move) so the scrub feels notched like a stepper. No-op on
      // desktop via the provider.
      haptic("selection");

      lastTargetCountRef.current = targetCount;
      setPreviewDelta(targetCount - baselineCountRef.current);
      applyTargetCount(targetCount);
    },
    [applyTargetCount, axis, haptic]
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      const origin = pointerOriginRef.current;
      const wasScrub = didScrubRef.current;
      const netAdded = netAddedRef.current;

      if (wasScrub) {
        if (netAdded > 0) {
          focusTrailingCell();
        }
        resetPointerState();
        return;
      }

      resetPointerState();

      if (!origin) {
        return;
      }

      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      if (Math.hypot(dx, dy) <= POINTER_CLICK_DRAG_THRESHOLD_PX) {
        onClickAdd();
      }
    },
    [focusTrailingCell, onClickAdd, resetPointerState]
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      resetPointerState();
    },
    [resetPointerState]
  );

  return {
    isScrubbing,
    previewDelta,
    scrubHandlers: {
      onPointerCancel: handlePointerCancel,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
    },
  };
}
