import { IconCalendar } from "@tabler/icons-react";
import type { DateRange } from "react-day-picker";

import { Calendar } from "@/components/ui/calendar.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import {
  type DayRange,
  formatRangeLabel,
  RANGE_PRESETS,
  type RangePresetId,
} from "@/lib/pages/analytics-range.ts";
import { cn } from "@/lib/utils.ts";

interface AnalyticsRangePickerProps {
  disabled?: boolean;
  onCustomRange: (range: DayRange) => void;
  onPreset: (preset: RangePresetId) => void;
  preset: RangePresetId | "custom";
  range: DayRange;
}

export function AnalyticsRangePicker({
  range,
  preset,
  onPreset,
  onCustomRange,
  disabled = false,
}: AnalyticsRangePickerProps) {
  const handleSelect = (selected: DateRange | undefined) => {
    if (selected?.from && selected.to) {
      onCustomRange({ from: selected.from, to: selected.to });
    }
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1",
        disabled && "pointer-events-none opacity-40"
      )}
    >
      {RANGE_PRESETS.map((option) => (
        <button
          className={cn(
            "h-6 rounded-md px-2 font-medium text-xs transition-colors",
            preset === option.id
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
          key={option.id}
          onClick={() => onPreset(option.id)}
          type="button"
        >
          {option.label}
        </button>
      ))}
      <Popover>
        <PopoverTrigger
          render={
            <button
              className={cn(
                "flex h-6 items-center gap-1.5 rounded-md px-2 font-medium text-xs transition-colors",
                preset === "custom"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              type="button"
            >
              <IconCalendar className="size-3.5 stroke-[1.5px]" />
              {preset === "custom" ? formatRangeLabel(range) : "Custom"}
            </button>
          }
        />
        <PopoverContent className="w-auto" side="bottom">
          <Calendar
            autoFocus
            defaultMonth={range.from}
            mode="range"
            numberOfMonths={1}
            onSelect={handleSelect}
            selected={{ from: range.from, to: range.to }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
