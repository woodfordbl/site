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
    <div
      className={cn(
        "flex flex-col gap-1 rounded-md border border-border bg-popover px-2 py-1.5 text-popover-foreground text-xs shadow-sm",
        TOOLTIP_WIDTH_CLASS
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {showIcon ? (
          <PageIconDisplay className="[&_svg]:size-3.5" icon={icon} />
        ) : null}
        <span className="min-w-0 truncate font-medium">{label}</span>
      </div>
      {details.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          {details.map((detail) => (
            <TooltipDetailRow detail={detail} key={detail.fieldId} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
