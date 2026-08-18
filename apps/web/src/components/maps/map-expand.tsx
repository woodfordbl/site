import { AnimatePresence, m } from "motion/react";
import type React from "react";
import { type ReactNode, useEffect } from "react";

import { MORPH_TRANSITION } from "@/components/ui/morph-motion.tsx";
import { cn } from "@/lib/utils.ts";

/**
 * @fileoverview Expanding a map to fill a dialog, morphing the way the media
 * lightbox does — same spring, same backdrop fade.
 *
 * One difference from media, and it decides the whole shape of this: the
 * lightbox mounts a *second* `<img>` and morphs between the two with
 * `layoutId`. A map cannot be duplicated that way. A second `<Map>` is a
 * second MapLibre instance — another style fetch, another set of tiles, and a
 * camera that has to be copied across — and moving the existing canvas into a
 * portal unmounts and reinitialises it. So the map never moves: the frame it
 * already lives in animates from its place in the page to a fixed inset
 * position via motion's `layout`, and the same canvas is simply bigger.
 *
 * That rules out the browser's Fullscreen API too, which this replaces: it
 * takes the element out of the page's stacking context, so the app's own
 * chrome (menus, tooltips, the expanded frame's rounded corners) does not
 * come with it, and it cannot animate.
 */

/** Inset of the expanded frame from the viewport, matching the lightbox's gutter. */
const EXPANDED_CLASS = "fixed inset-4 z-50 sm:inset-8";

export interface MapExpandFrameProps {
  children: ReactNode;
  className?: string;
  /** Frame classes while inline — height, borders, whatever the host wants. */
  collapsedClassName: string;
  expanded: boolean;
  /** Attributes the host stamps on the frame (pointer surface, reveal group). */
  frameProps?: Record<string, string>;
  /** Accessible name for the expanded dialog. */
  label: string;
  onExpandedChange: (expanded: boolean) => void;
  ref?: React.Ref<HTMLDivElement>;
}

/**
 * The map's frame, inline or expanded. Escape closes, matching every other
 * dismissible surface; the backdrop is click-to-close and sits under the frame
 * so the map itself keeps every pointer gesture it had while inline.
 */
export function MapExpandFrame({
  children,
  className,
  collapsedClassName,
  expanded,
  frameProps,
  label,
  onExpandedChange,
  ref,
}: MapExpandFrameProps): ReactNode {
  useEffect(() => {
    if (!expanded) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onExpandedChange(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [expanded, onExpandedChange]);

  return (
    <>
      <AnimatePresence>
        {expanded ? (
          <m.button
            animate={{ opacity: 1 }}
            aria-label={`Close ${label}`}
            className="fixed inset-0 z-40 cursor-default bg-black/20"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={() => onExpandedChange(false)}
            type="button"
          />
        ) : null}
      </AnimatePresence>
      <m.div
        {...frameProps}
        aria-label={expanded ? label : undefined}
        aria-modal={expanded ? true : undefined}
        className={cn(
          // Opaque: the `region` mark draws on a blank canvas with no basemap
          // behind it, so an expanded frame without a surface of its own shows
          // the page straight through the countries.
          "relative overflow-hidden rounded-lg border border-border bg-background",
          expanded ? EXPANDED_CLASS : collapsedClassName,
          className
        )}
        layout
        ref={ref}
        role={expanded ? "dialog" : undefined}
        transition={MORPH_TRANSITION}
      >
        {children}
      </m.div>
    </>
  );
}
