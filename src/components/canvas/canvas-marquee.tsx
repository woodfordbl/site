import type { RefObject } from "react";

import { useCanvasMarquee } from "@/hooks/use-canvas-marquee.ts";

/**
 * Drag-select overlay: renders the marquee rectangle while the user drags from
 * empty canvas space (see useCanvasMarquee). Fixed-positioned in viewport
 * coordinates, so it can live anywhere inside the editor providers.
 */
export function CanvasMarquee({
  scrollRootRef,
}: {
  scrollRootRef: RefObject<HTMLElement | null>;
}) {
  const rect = useCanvasMarquee(scrollRootRef);
  if (!rect) {
    return null;
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-40 rounded-xs border border-selection-primary/50 bg-selection-primary/10"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }}
    />
  );
}
