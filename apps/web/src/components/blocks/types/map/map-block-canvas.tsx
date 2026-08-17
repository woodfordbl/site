"use client";

import { type ReactNode, useEffect } from "react";

import { MapOverlayControls } from "@/components/maps/map-overlay-controls.tsx";
import {
  Map,
  MapMarker,
  MarkerContent,
  MarkerTooltip,
  useMap,
} from "@/components/ui/map.tsx";
import { ensureLocalMaplibreWorker } from "@/lib/maps/maplibre-worker.ts";
import type { MapProps } from "@/lib/schemas/block-props.ts";

ensureLocalMaplibreWorker();

/**
 * @fileoverview The MapLibre half of the `map` block, loaded with a dynamic `import()` from
 * `map-view.tsx` so `maplibre-gl` never enters the server graph or any page
 * without a map on it.
 */

export interface MapBlockCanvasProps {
  /** Expanded state of the host frame, which is what actually morphs. */
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Edit mode: clicking the map drops/moves the pin. */
  onPickCoordinate?: (coordinate: { lat: number; lng: number }) => void;
  props: MapProps;
  theme: "dark" | "light";
}

/**
 * Binds a map click to the pin-placement callback. Has to be a child of
 * `<Map>` — the map instance only exists inside its context.
 */
function ClickToPlace({
  onPick,
}: {
  onPick: (coordinate: { lat: number; lng: number }) => void;
}): ReactNode {
  const { map } = useMap();

  useEffect(() => {
    if (!map) {
      return;
    }
    const handleClick = (event: { lngLat: { lat: number; lng: number } }) => {
      onPick({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    };
    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, [map, onPick]);

  return null;
}

export function MapBlockCanvas({
  expanded,
  onExpandedChange,
  onPickCoordinate,
  props,
  theme,
}: MapBlockCanvasProps): ReactNode {
  const markers = props.markers ?? [];

  return (
    <Map
      attributionControl={false}
      center={props.center}
      theme={theme}
      zoom={props.zoom}
    >
      <MapOverlayControls
        expanded={expanded}
        onExpandedChange={onExpandedChange}
      />
      {onPickCoordinate ? <ClickToPlace onPick={onPickCoordinate} /> : null}
      {markers.map((marker) => (
        <MapMarker
          key={`${marker.lng},${marker.lat}`}
          latitude={marker.lat}
          longitude={marker.lng}
        >
          <MarkerContent>
            <span className="block size-3 rounded-full border-2 border-background bg-primary shadow-sm" />
          </MarkerContent>
          {marker.label ? (
            <MarkerTooltip className="rounded-md border border-border bg-popover px-2 py-1 font-medium text-popover-foreground text-xs shadow-sm">
              {marker.label}
            </MarkerTooltip>
          ) : null}
        </MapMarker>
      ))}
    </Map>
  );
}
