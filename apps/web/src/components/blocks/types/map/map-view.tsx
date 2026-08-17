import { type ReactNode, useEffect, useState } from "react";

import {
  type MapBlockPlace,
  useMapBlockPlace,
} from "@/components/blocks/types/map/use-map-block-place.ts";
import { useSiteAppearance } from "@/components/layout/theme-provider.tsx";
import { MapAttribution } from "@/components/maps/map-attribution.tsx";
import { MapExpandFrame } from "@/components/maps/map-expand.tsx";
import { MorphMotionProvider } from "@/components/ui/morph-motion.tsx";
import type { MapProps } from "@/lib/schemas/block-props.ts";
import { cn } from "@/lib/utils.ts";

/**
 * @fileoverview `map` block: one place on a page. The MapLibre canvas sits
 * behind a dynamic import (`map-block-canvas.tsx`) so it stays out of the
 * server graph.
 *
 * The place is either pinned into the block or read from the host row's
 * location property (`use-map-block-place.ts`). Both render through here, so a
 * bound block on a row template looks exactly like a pinned one on a page.
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
  expanded = false,
  onExpandedChange,
}: {
  children: ReactNode;
  className?: string;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  return (
    <MorphMotionProvider>
      <MapExpandFrame
        className={className}
        collapsedClassName={cn("w-full", MAP_BLOCK_HEIGHT_CLASS)}
        expanded={expanded}
        frameProps={{
          // MapLibre reads its own drags; the page canvas must not claim them.
          "data-canvas-pointer-surface": "",
          // Reveals the overlay controls, like the page cover's toolbar.
          "data-reveal-group": "",
        }}
        label="Map"
        onExpandedChange={onExpandedChange ?? (() => undefined)}
      >
        {children}
      </MapExpandFrame>
    </MorphMotionProvider>
  );
}

/**
 * Why a bound block is drawing nothing, in the reader's terms. Rendered at
 * map height so the page does not reflow when the row gains coordinates.
 */
export function MapBlockNotice({
  className,
  detail,
  title,
}: {
  className?: string;
  detail?: string;
  title: string;
}): ReactNode {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-border border-dashed px-4 text-center",
        MAP_BLOCK_HEIGHT_CLASS,
        className
      )}
    >
      <span className="font-medium text-muted-foreground text-sm">{title}</span>
      {detail ? (
        <span className="text-muted-foreground/70 text-xs">{detail}</span>
      ) : null}
    </div>
  );
}

/** The notice a resolved-but-undrawable place shows, or `null` to draw a map. */
export function mapPlaceNotice(
  place: MapBlockPlace
): { detail?: string; title: string } | null {
  if (place.kind === "unresolved") {
    return {
      detail: "Open the row and search for it to add coordinates.",
      title: place.label,
    };
  }
  if (place.kind === "no-value") {
    return { title: "This row has no location yet" };
  }
  if (place.kind === "unavailable") {
    return place.reason === "not-a-row"
      ? {
          detail: "Add it to a database row page or a row template.",
          title: "This page is not a database row",
        }
      : { title: "That location property no longer exists" };
  }
  return null;
}

interface MapViewProps {
  className?: string;
  /** Edit mode: clicking the map drops/moves the pin. */
  onPickCoordinate?: (coordinate: { lat: number; lng: number }) => void;
  /**
   * Corner chrome drawn over whatever the block renders — the bound block's
   * address + ⋯ menu. Passed in rather than rendered here so it also covers
   * the notice states, where unbinding is the only way forward.
   */
  overlay?: ReactNode;
  props: MapProps;
}

export function MapView({
  className,
  onPickCoordinate,
  overlay,
  props,
}: MapViewProps) {
  const { resolvedTheme } = useSiteAppearance();
  const canvas = useMapBlockCanvas();
  const place = useMapBlockPlace(props);
  const notice = mapPlaceNotice(place);
  const [expanded, setExpanded] = useState(false);

  if (notice) {
    return (
      <div className="relative">
        <MapBlockNotice className={className} {...notice} />
        {overlay}
      </div>
    );
  }

  if (!canvas || place.kind !== "map") {
    return (
      <MapBlockFrame className={cn("bg-muted/40", className)}>
        {overlay}
      </MapBlockFrame>
    );
  }

  return (
    <MapBlockFrame
      className={className}
      expanded={expanded}
      onExpandedChange={setExpanded}
    >
      <canvas.MapBlockCanvas
        expanded={expanded}
        onExpandedChange={setExpanded}
        onPickCoordinate={onPickCoordinate}
        props={place.props}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
      />
      {overlay}
      <MapAttribution />
    </MapBlockFrame>
  );
}
