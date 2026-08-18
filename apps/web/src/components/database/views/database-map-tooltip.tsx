import type { ReactNode } from "react";

import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { BLOCK_COLOR_DEFS } from "@/lib/blocks/block-colors.ts";
import type { MapTooltipDetail } from "@/lib/databases/map-tooltip.ts";
import { cn } from "@/lib/utils.ts";

/**
 * @fileoverview The card a marker shows on hover: row icon, title, and the
 * properties the view chose — the map's equivalent of a board card's face.
 *
 * Its own module so the MapLibre canvas stays about geometry. It renders only
 * what `lib/databases/map-tooltip.ts` already projected (finished text and
 * option colors), so no field schema or cell renderer reaches the map bundle.
 */

/** Cap the card's width so a long address wraps instead of spanning the map. */
const TOOLTIP_WIDTH_CLASS = "max-w-64";

/** One property row: name on the left, values on the right. */
function TooltipDetailRow({ detail }: { detail: MapTooltipDetail }): ReactNode {
  return (
    <div className="flex items-start gap-2">
      <span className="min-w-0 shrink-0 basis-20 truncate text-muted-foreground">
        {detail.label}
      </span>
      <span className="flex min-w-0 flex-1 flex-wrap justify-end gap-1">
        {detail.values.map((value) => {
          const color = value.color ? BLOCK_COLOR_DEFS[value.color] : undefined;
          return color ? (
            <span
              className={cn(
                "inline-flex max-w-full items-center rounded px-1 text-foreground",
                color.bgClass
              )}
              key={value.text}
            >
              <span className="truncate">{value.text}</span>
            </span>
          ) : (
            <span className="min-w-0 truncate text-foreground" key={value.text}>
              {value.text}
            </span>
          );
        })}
      </span>
    </div>
  );
}

/**
 * Offset from the cursor so the card never sits under the pointer (which would
 * flicker as the map re-reads what is hovered).
 */
const CURSOR_OFFSET_PX = 14;

export interface MapRegionCardProps {
  details: readonly MapTooltipDetail[];
  /** Flip to the other side of the cursor when the frame edge is close. */
  flipX: boolean;
  flipY: boolean;
  /** Cursor position in canvas pixels; the card follows it. */
  point: { x: number; y: number };
  title: string;
}

/**
 * The card a shaded region shows on hover: its name and the numbers behind the
 * shade. Positioned at the cursor rather than pinned to a corner — a
 * choropleth is read by pointing at countries, and a fixed readout makes the
 * eye travel away from the one being pointed at.
 *
 * `pointer-events-none` keeps it out of MapLibre's hit testing, so moving
 * across it never counts as leaving the region underneath.
 */
export function MapRegionCard({
  details,
  flipX,
  flipY,
  point,
  title,
}: MapRegionCardProps): ReactNode {
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-10",
        // Frames clip their overflow, so near an edge the card sits on the
        // other side of the cursor instead of being cut in half.
        flipX && "-translate-x-full",
        flipY && "-translate-y-full"
      )}
      style={{
        left: point.x + (flipX ? -CURSOR_OFFSET_PX : CURSOR_OFFSET_PX),
        top: point.y + (flipY ? -CURSOR_OFFSET_PX : CURSOR_OFFSET_PX),
      }}
    >
      <MapCardSurface>
        <span className="min-w-0 truncate font-medium">{title}</span>
        <TooltipDetailList details={details} />
      </MapCardSurface>
    </div>
  );
}

export interface MapMarkerCardProps {
  details: readonly MapTooltipDetail[];
  /** Row glyph; absent falls back to the default page icon, as the grid does. */
  icon?: string;
  label: string;
  showIcon: boolean;
}

/**
 * Title-only by default — the same restraint a new board card starts with —
 * growing a property list once the view names fields for it.
 */
export function MapMarkerCard({
  details,
  icon,
  label,
  showIcon,
}: MapMarkerCardProps): ReactNode {
  return (
    <MapCardSurface>
      <div className="flex min-w-0 items-center gap-1.5">
        {showIcon ? (
          <PageIconDisplay className="[&_svg]:size-3.5" icon={icon} />
        ) : null}
        <span className="min-w-0 truncate font-medium">{label}</span>
      </div>
      <TooltipDetailList details={details} />
    </MapCardSurface>
  );
}

/** Shared chrome so a marker card and a region card read as one thing. */
function MapCardSurface({ children }: { children: ReactNode }): ReactNode {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-md border border-border bg-popover px-2 py-1.5 text-popover-foreground text-xs shadow-sm",
        TOOLTIP_WIDTH_CLASS
      )}
    >
      {children}
    </div>
  );
}

/** The property rows under a card's title; nothing when there are none. */
function TooltipDetailList({
  details,
}: {
  details: readonly MapTooltipDetail[];
}): ReactNode {
  if (details.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-0.5">
      {details.map((detail) => (
        <TooltipDetailRow detail={detail} key={detail.fieldId} />
      ))}
    </div>
  );
}
