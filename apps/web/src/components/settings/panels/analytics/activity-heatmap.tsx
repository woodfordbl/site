import { useMemo } from "react";

import type { ActivityHeatmap } from "@/lib/pages/page-activity-analytics.ts";
import { cn } from "@/lib/utils.ts";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_TICKS = [0, 6, 12, 18];

function formatHour(hour: number): string {
  if (hour === 0) {
    return "12am";
  }
  if (hour === 12) {
    return "12pm";
  }
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

interface ActivityHeatmapGridProps {
  heatmap: ActivityHeatmap;
}

export function ActivityHeatmapGrid({ heatmap }: ActivityHeatmapGridProps) {
  const rows = useMemo(() => {
    const byWeekday = WEEKDAY_LABELS.map((label) => ({
      label,
      cells: Array.from({ length: 24 }, (_, hour) => ({
        id: `${label}-${hour}`,
        hour,
        count: 0,
      })),
    }));
    for (const cell of heatmap.cells) {
      byWeekday[cell.weekday].cells[cell.hour].count = cell.count;
    }
    return byWeekday;
  }, [heatmap.cells]);

  const max = Math.max(1, heatmap.max);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-1">
        {rows.map((row) => (
          <div className="flex items-center gap-1.5" key={row.label}>
            <span className="w-7 shrink-0 text-[10px] text-muted-foreground">
              {row.label}
            </span>
            <div className="grid flex-1 gap-[3px] [grid-template-columns:repeat(24,minmax(0,1fr))]">
              {row.cells.map((cell) => {
                const intensity =
                  cell.count === 0 ? 0 : 0.18 + 0.82 * (cell.count / max);
                return (
                  <div
                    className={cn(
                      "aspect-square w-full rounded-[2px]",
                      cell.count === 0 && "bg-muted"
                    )}
                    key={cell.id}
                    style={
                      cell.count === 0
                        ? undefined
                        : {
                            backgroundColor: "var(--chart-1)",
                            opacity: intensity,
                          }
                    }
                    title={`${row.label} ${formatHour(cell.hour)}: ${cell.count} event${cell.count === 1 ? "" : "s"}`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-7 shrink-0" />
        <div className="relative grid flex-1 [grid-template-columns:repeat(24,minmax(0,1fr))]">
          {HOUR_TICKS.map((hour) => (
            <span
              className="text-[10px] text-muted-foreground"
              key={hour}
              style={{ gridColumnStart: hour + 1 }}
            >
              {formatHour(hour)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
