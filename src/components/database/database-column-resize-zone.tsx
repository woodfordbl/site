import type { CSSProperties } from "react";

import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import { cn } from "@/lib/utils.ts";

interface DatabaseColumnResizeZoneProps {
  fieldId: string;
  /** The column's minimum width, so a drag never resizes below its floor. */
  minWidth: number;
  onResizeStart: (
    fieldId: string,
    minWidth: number,
    event: React.PointerEvent<HTMLElement>
  ) => void;
}

/**
 * Between-column resize zone on a header cell's right edge: an invisible hit
 * area (~8px on fine pointers, ~16px on coarse) with a hover-reveal
 * full-header-height `bg-selection` divider (300ms reveal delay — the same
 * grammar as the columns block's `ColumnResizeZone`). The zone sits entirely
 * inside its own header cell so sticky pinned columns and the cell's
 * overflow clipping need no special casing, and `touch-none` applies to the
 * zone only — a pointerdown that starts here captures the pointer for the
 * resize, while pans anywhere else on the header keep scrolling the grid.
 * Double-click / double-tap resets the column width (detected in
 * `useDatabaseColumnResize`).
 */
export function DatabaseColumnResizeZone({
  fieldId,
  minWidth,
  onResizeStart,
}: DatabaseColumnResizeZoneProps) {
  const isCoarsePointer = useIsCoarsePrimaryPointer();

  return (
    // --reveal-delay: deliberate wait before the divider fades in (see motion.md).
    <div
      className="absolute inset-y-0 right-0 z-20 flex touch-none"
      data-reveal-group=""
      style={{ "--reveal-delay": "300ms" } as CSSProperties}
    >
      <button
        aria-label="Resize column"
        className={cn(
          "flex h-full cursor-ew-resize touch-none items-center justify-end outline-none",
          "focus-visible:ring-3 focus-visible:ring-ring/50",
          "focus-visible:[&_span]:opacity-100 active:[&_span]:opacity-100",
          isCoarsePointer ? "w-4" : "w-2"
        )}
        onPointerDown={(event) => {
          onResizeStart(fieldId, minWidth, event);
        }}
        type="button"
      >
        <span aria-hidden className="hover-reveal h-full w-0.5 bg-selection" />
      </button>
    </div>
  );
}
