"use client";

import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import {
  type ChevronProps,
  DayPicker,
  type DayPickerProps,
  getDefaultClassNames,
} from "react-day-picker";

import { cn } from "@/lib/utils.ts";

export type CalendarProps = DayPickerProps;

function CalendarChevron({ orientation, className }: ChevronProps) {
  const Icon = orientation === "left" ? IconChevronLeft : IconChevronRight;
  return <Icon className={cn("size-4 stroke-[1.5px]", className)} />;
}

const CALENDAR_COMPONENTS = { Chevron: CalendarChevron };

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
      className={cn("text-sm", className)}
      classNames={{
        root: cn(defaults.root, "w-fit"),
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
        month_grid: cn(defaults.month_grid, "border-collapse"),
        weekdays: cn(defaults.weekdays, "flex"),
        weekday: cn(
          defaults.weekday,
          "w-9 font-normal text-[0.7rem] text-muted-foreground"
        ),
        week: cn(defaults.week, "mt-1 flex w-full"),
        day: cn(
          defaults.day,
          "relative size-9 p-0 text-center",
          "[&:has(.rdp-range_middle)]:bg-muted",
          "[&:has(.rdp-range_end)]:rounded-r-md [&:has(.rdp-range_start)]:rounded-l-md"
        ),
        day_button: cn(
          defaults.day_button,
          "inline-flex size-9 items-center justify-center rounded-md font-normal tabular-nums hover:bg-muted aria-selected:opacity-100"
        ),
        range_start: cn(
          defaults.range_start,
          "rdp-range_start rounded-l-md bg-primary text-primary-foreground [&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary"
        ),
        range_middle: cn(
          defaults.range_middle,
          "rdp-range_middle [&>button]:rounded-none [&>button]:bg-transparent [&>button]:text-foreground"
        ),
        range_end: cn(
          defaults.range_end,
          "rdp-range_end rounded-r-md bg-primary text-primary-foreground [&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary"
        ),
        selected: cn(
          defaults.selected,
          "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary"
        ),
        today: cn(defaults.today, "font-medium text-primary"),
        outside: cn(defaults.outside, "text-muted-foreground/50"),
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
