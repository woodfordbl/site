import type { ReactNode } from "react";

import { useChartDitherFill } from "@/components/ui/chart.tsx";
import { cn } from "@/lib/utils.ts";

export interface RankedBarItem {
  /** Right-aligned display value; defaults to the formatted `value`. */
  display?: ReactNode;
  key: string;
  label: ReactNode;
  /** Optional leading glyph (emoji / icon node). */
  leading?: ReactNode;
  value: number;
}

interface RankedBarListProps {
  /** Bar fill color (CSS color or var). Defaults to `var(--chart-1)`. */
  colorVar?: string;
  emptyLabel?: string;
  items: RankedBarItem[];
  /** Override the denominator; defaults to the largest item value. */
  max?: number;
}

export function RankedBarList({
  items,
  colorVar = "var(--chart-1)",
  max,
  emptyLabel = "Nothing here yet.",
}: RankedBarListProps) {
  const { ref, fillStyle, enabled } = useChartDitherFill<HTMLUListElement>([
    colorVar,
  ]);

  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-muted-foreground text-sm">
        {emptyLabel}
      </p>
    );
  }

  const denominator = Math.max(
    1,
    max ?? items.reduce((peak, item) => Math.max(peak, item.value), 0)
  );
  // Square the track + fill when dithering so they snap to the pixel grid.
  const trackRadius = enabled ? "rounded-[1px]" : "rounded-full";

  return (
    <ul className="flex flex-col gap-2.5" ref={ref}>
      {items.map((item) => {
        const ratio = Math.max(0, Math.min(1, item.value / denominator));
        return (
          <li className="flex flex-col gap-1" key={item.key}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-1.5">
                {item.leading ? (
                  <span className="shrink-0 text-muted-foreground [&>svg]:size-3.5">
                    {item.leading}
                  </span>
                ) : null}
                <span className="truncate">{item.label}</span>
              </span>
              <span className="shrink-0 font-medium font-mono text-muted-foreground text-xs tabular-nums">
                {item.display ?? item.value.toLocaleString()}
              </span>
            </div>
            <div
              className={cn(
                "h-1.5 w-full overflow-hidden bg-muted",
                trackRadius
              )}
            >
              <div
                className={cn("h-full transition-[width]", trackRadius)}
                style={{
                  width: `${Math.max(ratio * 100, item.value > 0 ? 2 : 0)}%`,
                  ...fillStyle(colorVar),
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
