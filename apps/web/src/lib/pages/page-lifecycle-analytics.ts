import {
  type DayRange,
  eachDayKey,
  formatDayLabel,
  startOfDay,
  toDayKey,
} from "@/lib/pages/analytics-range.ts";

export interface PageCreationInput {
  createdAt: string;
  deletedAt?: string;
}

export interface PageCreationDay {
  /** Pages created on this day (within the range). */
  created: number;
  /** Total live pages that existed by the end of this day (all-time). */
  cumulative: number;
  date: string;
  dayKey: string;
}

/**
 * Builds a per-day series of pages created plus the running total of live pages
 * over an explicit range. Cumulative counts all pages created on or before each
 * day (across all time, not just the range) so the line reflects true growth.
 */
export function bucketPagesCreatedByDay(
  pages: PageCreationInput[],
  range: DayRange
): PageCreationDay[] {
  const createdByDay = new Map<string, number>();
  const live = pages.filter((page) => !page.deletedAt);

  for (const page of live) {
    const dayKey = toDayKey(new Date(page.createdAt));
    createdByDay.set(dayKey, (createdByDay.get(dayKey) ?? 0) + 1);
  }

  const dayKeys = eachDayKey(range);

  return dayKeys.map((dayKey) => {
    const [year, month, day] = dayKey.split("-").map(Number);
    const dayEnd = startOfDay(new Date(year, month - 1, day)).getTime();
    const cumulative = live.filter(
      (page) => startOfDay(new Date(page.createdAt)).getTime() <= dayEnd
    ).length;

    return {
      date: formatDayLabel(new Date(year, month - 1, day)),
      dayKey,
      created: createdByDay.get(dayKey) ?? 0,
      cumulative,
    };
  });
}
