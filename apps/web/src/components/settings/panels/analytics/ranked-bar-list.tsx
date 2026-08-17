import type { ReactNode } from "react";

/**
 * @fileoverview A ranked list of labelled CSS bar meters — the analytics
 * panel's non-chart visual. Bars are `div` widths rather than a chart because
 * each row pairs a bar with a label and a value in one text line; the palette
 * token they fill with still comes from the enclosing `ChartPaletteScope`, so
 * they match the charts beside them.
 */

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

  return (
    <ul className="flex flex-col gap-2.5">
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
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  backgroundColor: colorVar,
                  width: `${Math.max(ratio * 100, item.value > 0 ? 2 : 0)}%`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
