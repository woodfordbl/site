"use client";

import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconMinus,
  IconPlus,
} from "@tabler/icons-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button.tsx";
import { ButtonGroup } from "@/components/ui/button-group.tsx";
import { useMap } from "@/components/ui/map.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";

/**
 * @fileoverview Map camera controls in the app's own overlay idiom, replacing
 * mapcn's stacked square buttons.
 *
 * Same chrome as the page cover's toolbar — a frosted `ButtonGroup` of
 * `overlayItem` buttons with tooltips — because both are controls floating over
 * someone else's image. They reveal on hover of the map frame
 * (`[data-reveal-group]`) rather than sitting on the map permanently: chrome
 * over a map competes with the data drawn underneath it.
 *
 * Must render inside `<Map>`; it drives the camera through mapcn's `useMap`.
 */

/** Matches mapcn's own zoom step and easing, so the motion is unchanged. */
const ZOOM_STEP = 1;
const ZOOM_DURATION_MS = 300;

function ControlButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}): ReactNode {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            onClick={onClick}
            size="icon-xs"
            type="button"
            variant="overlayItem"
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export interface MapOverlayControlsProps {
  /** Offer fullscreen. Off for maps whose frame is already the whole point. */
  showFullscreen?: boolean;
}

export function MapOverlayControls({
  showFullscreen = false,
}: MapOverlayControlsProps): ReactNode {
  const { map } = useMap();
  const [isFullscreen, setIsFullscreen] = useState(false);

  // The document owns fullscreen state — Escape and the browser's own chrome
  // can leave it without going through this button.
  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const zoomBy = useCallback(
    (delta: number) => {
      map?.zoomTo(map.getZoom() + delta, { duration: ZOOM_DURATION_MS });
    },
    [map]
  );

  const toggleFullscreen = useCallback(() => {
    const container = map?.getContainer();
    if (!container) {
      return;
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
      return;
    }
    container.requestFullscreen().catch(() => undefined);
  }, [map]);

  return (
    <TooltipProvider delay={400}>
      <ButtonGroup
        aria-label="Map controls"
        className="hover-reveal absolute top-3 right-3 z-10"
        orientation="vertical"
        variant="overlay"
      >
        <ControlButton label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)}>
          <IconPlus />
        </ControlButton>
        <ControlButton label="Zoom out" onClick={() => zoomBy(-ZOOM_STEP)}>
          <IconMinus />
        </ControlButton>
        {showFullscreen ? (
          <ControlButton
            label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <IconArrowsMinimize /> : <IconArrowsMaximize />}
          </ControlButton>
        ) : null}
      </ButtonGroup>
    </TooltipProvider>
  );
}
