"use client";

import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconMinus,
  IconPlus,
} from "@tabler/icons-react";
import { type ReactNode, useCallback, useEffect } from "react";

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
 * Expanding is the host frame's job (`map-expand.tsx`) — this only asks for it.
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
  /** Current expanded state, when the host frame offers expanding. */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

export function MapOverlayControls({
  expanded,
  onExpandedChange,
}: MapOverlayControlsProps): ReactNode {
  const { map } = useMap();

  // The container changes size continuously while the frame morphs (and again
  // whenever the sidebar or the window moves), and MapLibre only watches the
  // window. Without this the canvas keeps its old size until something else
  // triggers a resize, so an expanded map draws into a letterboxed corner.
  useEffect(() => {
    const container = map?.getContainer();
    if (!(container && typeof ResizeObserver !== "undefined")) {
      return;
    }
    const observer = new ResizeObserver(() => map?.resize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);

  const zoomBy = useCallback(
    (delta: number) => {
      map?.zoomTo(map.getZoom() + delta, { duration: ZOOM_DURATION_MS });
    },
    [map]
  );

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
        {onExpandedChange ? (
          <ControlButton
            label={expanded ? "Close expanded map" : "Expand map"}
            onClick={() => onExpandedChange(!expanded)}
          >
            {expanded ? <IconArrowsMinimize /> : <IconArrowsMaximize />}
          </ControlButton>
        ) : null}
      </ButtonGroup>
    </TooltipProvider>
  );
}
