import type { CSSProperties } from "react";

import { ResizeHandle } from "@/components/ui/resize-handle.tsx";
import { cn } from "@/lib/utils.ts";

interface ColumnResizeZoneProps {
  className?: string;
  leftColumnId: string;
  onResizeStart: (
    leftColumnId: string,
    rightColumnId: string,
    event: React.PointerEvent<HTMLButtonElement>
  ) => void;
  rightColumnId: string;
}

/** Full-height divider centered in the column leading gutter band (between + and grab). */
export function ColumnResizeZone({
  className,
  leftColumnId,
  rightColumnId,
  onResizeStart,
}: ColumnResizeZoneProps) {
  return (
    // --reveal-delay: deliberate wait before the divider fades in (see motion.md).
    <div
      className={cn(
        "pointer-events-none absolute top-0 bottom-0 left-6 z-10 hidden -translate-x-1/2 touch-none md:flex",
        className
      )}
      data-reveal-group=""
      style={{ "--reveal-delay": "300ms" } as CSSProperties}
    >
      <ResizeHandle
        ariaLabel="Resize columns"
        className={cn(
          "pointer-events-auto h-full",
          "focus-visible:[&_span]:opacity-100",
          "active:[&_span]:opacity-100"
        )}
        lineClassName="hover-reveal h-full bg-selection"
        onResizeStart={(event) => {
          onResizeStart(leftColumnId, rightColumnId, event);
        }}
        variant="stretch"
      />
    </div>
  );
}
