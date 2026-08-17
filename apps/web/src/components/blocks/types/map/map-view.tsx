import { type ReactNode, useEffect, useState } from "react";

import { useSiteAppearance } from "@/components/layout/theme-provider.tsx";
import type { MapProps } from "@/lib/schemas/block-props.ts";
import { cn } from "@/lib/utils.ts";

/**
 * @fileoverview `map` block: a standalone place on a page. The MapLibre canvas sits behind a
 * dynamic import (`map-block-canvas.tsx`) so it stays out of the server graph.
 */

/** Frame height for the block's map. */
export const MAP_BLOCK_HEIGHT_CLASS = "h-80";

type MapBlockCanvasModule = typeof import("./map-block-canvas.tsx");

/**
 * Loads the client-only MapLibre canvas. Returns `null` until it resolves, so
 * callers render their own placeholder at map height.
 */
export function useMapBlockCanvas(): MapBlockCanvasModule | null {
  const [canvas, setCanvas] = useState<MapBlockCanvasModule | null>(null);

  useEffect(() => {
    import("./map-block-canvas.tsx")
      .then((module) => {
        setCanvas(module);
      })
      .catch(() => {
        /* client-only MapLibre bundle */
      });
  }, []);

  return canvas;
}

export function MapBlockFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-lg border border-border",
        MAP_BLOCK_HEIGHT_CLASS,
        className
      )}
      // MapLibre reads its own drags; the page canvas must not claim them.
      data-canvas-pointer-surface=""
    >
      {children}
    </div>
  );
}

interface MapViewProps {
  className?: string;
  /** Edit mode: clicking the map drops/moves the pin. */
  onPickCoordinate?: (coordinate: { lat: number; lng: number }) => void;
  props: MapProps;
}

export function MapView({ className, onPickCoordinate, props }: MapViewProps) {
  const { resolvedTheme } = useSiteAppearance();
  const canvas = useMapBlockCanvas();

  if (!canvas) {
    return (
      <MapBlockFrame className={cn("bg-muted/40", className)}>
        {null}
      </MapBlockFrame>
    );
  }

  return (
    <MapBlockFrame className={className}>
      <canvas.MapBlockCanvas
        onPickCoordinate={onPickCoordinate}
        props={props}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
      />
    </MapBlockFrame>
  );
}
