import { useEffect, useRef } from "react";

import type { DragPointer } from "@/lib/dnd/drag-store.ts";

export interface CanvasRowDragPreviewState {
  /** Detached clone of the dragged row content, with live field values copied in. */
  node: HTMLElement;
  /** Pointer offset within the row at drag start, so the preview tracks the grab point. */
  offsetX: number;
  offsetY: number;
  width: number;
}

/**
 * Follow-the-pointer preview for a touch (pointer) canvas-row drag. Renders the
 * cloned block content inside a floating card so the dragged row reads as the
 * actual block, not the browser's default translucent box.
 */
export function CanvasRowDragPreview({
  pointer,
  preview,
}: {
  pointer: DragPointer;
  preview: CanvasRowDragPreviewState;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const { node } = preview;
    if (!host) {
      return;
    }
    host.appendChild(node);
    return () => {
      if (node.parentNode === host) {
        host.removeChild(node);
      }
    };
  }, [preview]);

  const x = pointer.x - preview.offsetX;
  const y = pointer.y - preview.offsetY;

  return (
    <div
      className="absolute top-0 left-0 origin-top-left rounded-lg bg-background px-3 py-1.5 opacity-90 shadow-[0_8px_24px_oklch(0_0_0/0.12)] ring-1 ring-foreground/10"
      ref={hostRef}
      style={{
        width: `${preview.width}px`,
        transform: `translate3d(${x}px, ${y}px, 0) rotate(1deg)`,
      }}
    />
  );
}
