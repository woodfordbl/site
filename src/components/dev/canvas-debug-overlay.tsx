import { useEffect, useState, useSyncExternalStore } from "react";

import {
  isCanvasDebugOverlayEnabled,
  subscribeCanvasDebugOverlay,
} from "@/lib/canvas/canvas-devtools-store.ts";
import { collectCanvasScopeRects } from "@/lib/canvas/canvas-scopes.ts";
import { collectCanvasRowRects } from "@/lib/canvas/resolve-drop-target.ts";

const disabled = () => false;

interface OutlineRect {
  id: string;
  rect: DOMRect;
}

function toOutlines(rects: Map<string, DOMRect>): OutlineRect[] {
  return [...rects].map(([id, rect]) => ({ id, rect }));
}

/**
 * Dev-only geometry overlay: paints every `data-canvas-row-id` rect (solid
 * blue) and every `data-canvas-scope` content rect (dashed green) so pointer
 * features — marquee drill, overclick routing, DnD — can be debugged by
 * looking instead of logging. Toggled from the Canvas devtools panel.
 */
export function CanvasDebugOverlay() {
  const enabled = useSyncExternalStore(
    subscribeCanvasDebugOverlay,
    isCanvasDebugOverlayEnabled,
    disabled
  );
  const [, setFrame] = useState(0);

  // Re-measure every frame while enabled; dev-only, so the cost is accepted
  // in exchange for outlines that track scrolling and layout changes live.
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let frame = 0;
    const loop = () => {
      setFrame((current) => current + 1);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  const rowOutlines = toOutlines(collectCanvasRowRects());
  const scopeOutlines = toOutlines(collectCanvasScopeRects());

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
    >
      {rowOutlines.map(({ id, rect }) => (
        <div
          className="absolute border border-sky-500/60"
          key={`row-${id}`}
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          }}
        />
      ))}
      {scopeOutlines.map(({ id, rect }) => (
        <div
          className="absolute border border-emerald-500/80 border-dashed bg-emerald-500/5"
          key={`scope-${id}`}
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          }}
        >
          <span className="absolute top-0 left-0 bg-emerald-600/90 px-1 font-mono text-[9px] text-white">
            {id.slice(0, 8)}
          </span>
        </div>
      ))}
    </div>
  );
}
