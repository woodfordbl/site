import { cn } from "@/lib/utils.ts";

export type ResizeHandleOrientation = "horizontal" | "vertical";
export type ResizeHandleVariant = "pill" | "stretch";

interface ResizeHandleProps {
  ariaLabel: string;
  className?: string;
  lineClassName?: string;
  onResizeStart: (event: React.PointerEvent<HTMLButtonElement>) => void;
  orientation?: ResizeHandleOrientation;
  style?: React.CSSProperties;
  variant?: ResizeHandleVariant;
}

/**
 * Resize affordance for pointer-driven edge dragging.
 * `pill` — short rounded capsule, slightly inset on content edges (media).
 * `stretch` — full-span line for gutter dividers (columns).
 * Parent supplies absolute positioning and hover visibility classes.
 */
export function ResizeHandle({
  ariaLabel,
  className,
  lineClassName,
  onResizeStart,
  orientation = "vertical",
  style,
  variant = "stretch",
}: ResizeHandleProps) {
  const isVertical = orientation === "vertical";

  if (variant === "pill") {
    return (
      <button
        aria-label={ariaLabel}
        className={cn(
          "flex touch-none items-center justify-center rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          isVertical
            ? "h-10 w-4 cursor-col-resize"
            : "h-4 w-10 cursor-row-resize",
          className
        )}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onResizeStart(event);
        }}
        style={style}
        type="button"
      >
        <span
          aria-hidden
          className={cn(
            "shrink-0 rounded-full border border-border/80 bg-background/95 shadow-sm transition-[background-color,box-shadow] duration-150 ease-out",
            isVertical ? "h-9 w-1" : "h-1 w-9",
            lineClassName
          )}
        />
      </button>
    );
  }

  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        "flex touch-none items-center justify-center rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        isVertical
          ? "h-full min-h-8 w-3 cursor-col-resize"
          : "h-3 w-full min-w-8 cursor-row-resize",
        className
      )}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onResizeStart(event);
      }}
      style={style}
      type="button"
    >
      <span
        aria-hidden
        className={cn(
          "shrink-0 rounded-full bg-border transition-[opacity,background-color] duration-150 ease-out",
          isVertical ? "h-full w-0.5" : "h-0.5 w-full",
          lineClassName
        )}
      />
    </button>
  );
}
