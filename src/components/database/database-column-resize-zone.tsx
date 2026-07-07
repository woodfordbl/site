import type { CSSProperties } from "react";

import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import { cn } from "@/lib/utils.ts";

interface DatabaseColumnResizeZoneProps {
  /** The column's fallback width, so a never-resized column starts from it. */
  defaultWidth: number;
  fieldId: string;
  /** The column's minimum width, so a drag never resizes below its floor. */
  minWidth: number;
  onResizeStart: (
    fieldId: string,
    minWidth: number,
    defaultWidth: number,
    event: React.PointerEvent<HTMLElement>
  ) => void;
}

/**
 * Between-column resize zone on a header cell's right edge: a hit area
 * (~12px on fine pointers, ~20px on coarse) centered on the column boundary
 * via `left-full -translate-x-1/2`, with a hover-reveal full-header-height
 * (300ms reveal delay — the same grammar as the columns block's
 * `ColumnResizeZone`). The zone sits inside its header cell so sticky pinned
 * columns and overflow clipping need no special casing, and `touch-none`
 * applies to the zone only — a pointerdown that starts here captures the
 * pointer for the resize, while pans anywhere else on the header keep
 * scrolling the grid. Double-click / double-tap resets the column width
 * (detected in `useDatabaseColumnResize`).
 */
export function DatabaseColumnResizeZone({
  defaultWidth,
  fieldId,
  minWidth,
  onResizeStart,
}: DatabaseColumnResizeZoneProps) {
  const isCoarsePointer = useIsCoarsePrimaryPointer();

  return (
    // --reveal-delay: deliberate wait before the divider fades in (see motion.md).
    <div
      className="absolute inset-y-0 left-full z-20 flex -translate-x-1/2 touch-none"
      data-reveal-group=""
      style={{ "--reveal-delay": "300ms" } as CSSProperties}
    >
      <button
        aria-label="Resize column"
        className={cn(
          "relative flex h-full cursor-ew-resize touch-none outline-none",
          "focus-visible:ring-3 focus-visible:ring-ring/50",
          "focus-visible:[&_span]:opacity-100 active:[&_span]:opacity-100",
          isCoarsePointer ? "w-5" : "w-3"
        )}
        onPointerDown={(event) => {
          onResizeStart(fieldId, minWidth, defaultWidth, event);
        }}
        type="button"
      >
        <span
          aria-hidden
          className="hover-reveal absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-primary"
        />
      </button>
    </div>
  );
}
