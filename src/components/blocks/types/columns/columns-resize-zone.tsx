import type { CSSProperties } from "react";

import { REVEAL_DELAY_DELAYED_MS } from "@/components/ui/hover-reveal.ts";
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
    <div
      className={cn(
        "pointer-events-none absolute top-0 bottom-0 left-6 z-10 hidden -translate-x-1/2 touch-none md:flex",
        className
      )}
      data-reveal-group=""
      style={
        { "--reveal-delay": `${REVEAL_DELAY_DELAYED_MS}ms` } as CSSProperties
      }
    >
      <ResizeHandle
        ariaLabel="Resize columns"
        className={cn(
          "pointer-events-auto h-full",
          "active:[&_span]:opacity-100",
          "hover:[&_span]:bg-accent"
        )}
        lineClassName="hover-reveal h-full"
        onResizeStart={(event) => {
          onResizeStart(leftColumnId, rightColumnId, event);
        }}
        variant="stretch"
      />
    </div>
  );
}
