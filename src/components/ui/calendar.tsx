"use client";

import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useEffect, useRef } from "react";
import {
  type ChevronProps,
  type DayButton as DayButtonType,
  DayPicker,
  type DayPickerProps,
  getDefaultClassNames,
} from "react-day-picker";

import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

export type CalendarProps = DayPickerProps;

function CalendarChevron({ orientation, className }: ChevronProps) {
  const Icon = orientation === "left" ? IconChevronLeft : IconChevronRight;
  return <Icon className={cn("size-4 stroke-[1.5px]", className)} />;
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButtonType>) {
  const defaultClassNames = getDefaultClassNames();
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (modifiers.focused) {
      ref.current?.focus();
    }
  }, [modifiers.focused]);

  return (
    <Button
      className={cn(
        "flex size-9 p-0 font-normal text-foreground tabular-nums aria-selected:opacity-100",
        "data-[range-end=true]:rounded-md data-[range-end=true]:rounded-r-md data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground data-[range-end=true]:hover:bg-primary/80",
        "data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-transparent data-[range-middle=true]:text-accent-foreground data-[range-middle=true]:hover:bg-transparent",
        "data-[range-start=true]:rounded-md data-[range-start=true]:rounded-l-md data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[range-start=true]:hover:bg-primary/80",
        "data-[selected-single=true]:rounded-md data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[selected-single=true]:hover:bg-primary/80",
        defaultClassNames.day_button,
        className
      )}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      data-range-start={modifiers.range_start}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      ref={ref}
      variant="ghost"
      {...props}
    />
  );
}

const CALENDAR_COMPONENTS = {
  Chevron: CalendarChevron,
  DayButton: CalendarDayButton,
};

/** Tailwind-themed wrapper over react-day-picker, matching the app's tokens. */
export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const defaults = getDefaultClassNames();

  return (
    <DayPicker
      className={cn(
        "in-data-[slot=popover-content]:bg-transparent text-sm",
        className
      )}
      classNames={{
        root: cn(defaults.root, "mx-auto w-fit"),
        months: cn(defaults.months, "relative flex flex-col gap-4"),
        month: cn(defaults.month, "flex flex-col gap-3"),
        month_caption: cn(
          defaults.month_caption,
          "flex h-8 items-center justify-center px-8"
        ),
        caption_label: cn(defaults.caption_label, "font-medium text-sm"),
        nav: cn(
          defaults.nav,
          "absolute inset-x-0 top-0 flex items-center justify-between"
        ),
        button_previous: cn(
          defaults.button_previous,
          "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        ),
        button_next: cn(
          defaults.button_next,
          "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        ),
        month_grid: cn(defaults.month_grid, "border-collapse border-spacing-0"),
        weekdays: cn(defaults.weekdays),
        weekday: cn(
          defaults.weekday,
          "w-9 font-normal text-[0.7rem] text-muted-foreground"
        ),
        week: cn(defaults.week),
        day: cn(
          defaults.day,
          "group/day relative size-9 select-none p-0 text-center",
          "[&:first-child[data-selected=true]_button]:rounded-l-md [&:last-child[data-selected=true]_button]:rounded-r-md"
        ),
        day_button: cn(defaults.day_button),
        range_start: cn(
          defaults.range_start,
          "rounded-l-md bg-accent [&.rdp-range_end]:bg-transparent"
        ),
        range_middle: cn(defaults.range_middle, "rounded-none bg-accent"),
        range_end: cn(defaults.range_end, "rounded-r-md bg-accent"),
        selected: cn(defaults.selected),
        today: cn(defaults.today, "font-medium text-primary"),
        outside: cn(
          defaults.outside,
          "text-muted-foreground/50 aria-selected:text-muted-foreground"
        ),
        disabled: cn(defaults.disabled, "text-muted-foreground/40"),
        hidden: cn(defaults.hidden, "invisible"),
        ...classNames,
      }}
      components={CALENDAR_COMPONENTS}
      showOutsideDays={showOutsideDays}
      {...props}
    />
  );
}
