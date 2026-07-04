import { useCallback, useEffect, useRef, useState } from "react";

import {
  clampColumnWidthPx,
  configWithColumnWidth,
  configWithoutColumnWidth,
  resolveColumnWidthPx,
} from "@/components/database/database-grid-helpers.ts";
import { updateDatabaseView } from "@/db/queries/database-collection-ops.ts";
import type { DatabaseView } from "@/lib/schemas/database.ts";

/** Two taps on a divider within this window reset the column's width. */
const DOUBLE_TAP_RESET_MS = 400;

/** Pointer travel below this is a tap (double-tap reset), not a resize. */
const TAP_SLOP_PX = 3;

interface UseDatabaseColumnResizeOptions {
  databaseId: string;
  view: DatabaseView;
}

/**
 * Pixel-based column resize for the database table grid, mirroring the table
 * block's `useTableColumnResize`: pointer capture on the divider, rAF-batched
 * live widths in local state during the drag, and a single
 * `view.config.columnWidths` commit through `updateDatabaseView` on pointer
 * up. Only the column left of the divider changes width (clamped to
 * `MIN_COLUMN_WIDTH_PX`); neighbors never reflow.
 *
 * Double-click (or double-tap) on a divider resets that column's stored
 * width — detected here from two sub-slop pointer taps because a
 * `preventDefault`ed `pointerdown` does not reliably produce `dblclick`
 * across engines. A single stray tap never materializes a width.
 */
export function useDatabaseColumnResize({
  databaseId,
  view,
}: UseDatabaseColumnResizeOptions): {
  /** Field id → live width while a divider drag is active, else `null`. */
  liveWidths: Record<string, number> | null;
  startResize: (
    fieldId: string,
    event: React.PointerEvent<HTMLElement>
  ) => void;
} {
  const [liveWidths, setLiveWidths] = useState<Record<string, number> | null>(
    null
  );
  const rafRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ fieldId: string; time: number } | null>(null);
  // Latest view in a ref so a mid-drag config change never commits stale keys.
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    },
    []
  );

  const startResize = useCallback(
    (fieldId: string, event: React.PointerEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = resolveColumnWidthPx(viewRef.current.config, fieldId);
      const handleEl = event.currentTarget as HTMLElement;

      setLiveWidths({ [fieldId]: startWidth });
      handleEl.setPointerCapture(event.pointerId);

      let pendingDelta = 0;

      const flushMove = () => {
        rafRef.current = null;
        setLiveWidths({
          [fieldId]: clampColumnWidthPx(startWidth + pendingDelta),
        });
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

        const traveled = Math.hypot(
          upEvent.clientX - startX,
          upEvent.clientY - startY
        );
        if (traveled < TAP_SLOP_PX) {
          // Tap, not a drag: arm (or complete) the double-tap width reset.
          const last = lastTapRef.current;
          const now = Date.now();
          if (
            last &&
            last.fieldId === fieldId &&
            now - last.time <= DOUBLE_TAP_RESET_MS
          ) {
            lastTapRef.current = null;
            const config = configWithoutColumnWidth(
              viewRef.current.config,
              fieldId
            );
            if (config) {
              updateDatabaseView(databaseId, viewRef.current.id, { config });
            }
            return;
          }
          lastTapRef.current = { fieldId, time: now };
          return;
        }

        lastTapRef.current = null;
        const width = clampColumnWidthPx(
          startWidth + (upEvent.clientX - startX)
        );
        if (width === startWidth) {
          return;
        }
        updateDatabaseView(databaseId, viewRef.current.id, {
          config: configWithColumnWidth(viewRef.current.config, fieldId, width),
        });
      };

      const onCancel = (cancelEvent: PointerEvent) => {
        teardown(cancelEvent.pointerId);
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onCancel);
    },
    [databaseId]
  );

  return { liveWidths, startResize };
}
