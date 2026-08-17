import type { ReactNode } from "react";

import type { ChartLegendPosition } from "@/components/charts/chart-frame.tsx";
import { cn } from "@/lib/utils.ts";

/**
 * @fileoverview The chart legend, as React rather than scene nodes.
 *
 * A legend is a list of labelled swatches, not a visualization — rendering it
 * outside the SVG lets it inherit page typography, wrap on narrow layouts, and
 * sit beside the plot (the scene legend only supports top and bottom). Swatch
 * colors are the same `var(--chart-N)` references the marks paint with, so a
 * legend entry can never drift from its series.
 */

/** One legend entry: a series label and the color its mark paints in. */
export interface ChartLegendItem {
  /** CSS color for the swatch — a `var(--chart-N)` reference in practice. */
  color: string;
  /** Stable identity, matching the series key on the mark's color channel. */
  key: string;
  label: string;
}

export interface ChartLegendProps {
  items: readonly ChartLegendItem[];
  position?: ChartLegendPosition;
}

export function ChartLegend({
  items,
  position = "bottom",
}: ChartLegendProps): ReactNode {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul
      className={cn(
        "flex min-w-0 list-none flex-wrap text-muted-foreground",
        position === "right"
          ? "shrink-0 flex-col items-start gap-2"
          : "items-center justify-center gap-x-4 gap-y-1.5 pt-3"
      )}
    >
      {items.map((item) => (
        <li className="flex min-w-0 items-center gap-1.5" key={item.key}>
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-[2px]"
            style={{ backgroundColor: item.color }}
          />
          <span className="truncate">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
