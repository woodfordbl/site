"use client";

import { useEffect, useRef } from "react";

import { useMap } from "@/components/ui/map.tsx";

/**
 * @fileoverview Keeps the camera on a point that can change after mount.
 *
 * mapcn reads `center`/`zoom` exactly once — they go into the MapLibre
 * constructor — so every later change to those props is ignored. Its only
 * other path is a fully controlled viewport (`viewport` + `onViewportChange`),
 * which would mean owning the camera on every pan and writing it back through
 * React on each frame.
 *
 * A map bound to a row's location property has a point that moves on its own:
 * a different row in the template editor's Live Preview, an address edited in
 * the row's cell. This is the narrow version of controlling the camera — it
 * moves for a *changed* target and nothing else.
 *
 * The reader's own panning survives. The first target seen is recorded rather
 * than flown to (it is the one the map was built with), and zoom is left
 * alone, so a reader who has zoomed out keeps their framing while the map
 * travels to the new place.
 */

/** Long enough to read as travel between two places, short enough to wait out. */
const RECENTER_DURATION_MS = 600;

export function MapRecenter({ center }: { center?: [number, number] }): null {
  const { map } = useMap();
  const appliedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!(map && center)) {
      return;
    }
    const target = `${center[0]},${center[1]}`;
    if (appliedRef.current === target) {
      return;
    }
    const isFirst = appliedRef.current === null;
    appliedRef.current = target;
    if (isFirst) {
      return;
    }
    map.flyTo({ center, duration: RECENTER_DURATION_MS });
  }, [center, map]);

  return null;
}
