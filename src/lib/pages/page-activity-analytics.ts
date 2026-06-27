import type {
  PageActivityEvent,
  PageActivityEventType,
} from "@/lib/pages/page-activity-events.ts";

export interface ActivityDayBucket {
  count: number;
  date: string;
}

export interface ActivityPageCount {
  count: number;
  pageId: string;
}

export interface ActivityTypeCount {
  count: number;
  label: string;
  type: PageActivityEventType | "other";
}

function toDayKey(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDayLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Groups events into daily buckets for the last `days` calendar days (inclusive). */
export function bucketEventsByDay(
  events: PageActivityEvent[],
  days = 30
): ActivityDayBucket[] {
  const counts = new Map<string, number>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    counts.set(toDayKey(date.toISOString()), 0);
  }

  for (const event of events) {
    const dayKey = toDayKey(event.timestamp);
    if (counts.has(dayKey)) {
      counts.set(dayKey, (counts.get(dayKey) ?? 0) + 1);
    }
  }

  return [...counts.entries()].map(([date, count]) => ({
    date: formatDayLabel(date),
    count,
  }));
}

export function countEventsByPage(
  events: PageActivityEvent[]
): ActivityPageCount[] {
  const counts = new Map<string, number>();

  for (const event of events) {
    counts.set(event.pageId, (counts.get(event.pageId) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([pageId, count]) => ({ pageId, count }))
    .sort((left, right) => right.count - left.count);
}

const ACTIVITY_TYPE_LABELS: Partial<Record<PageActivityEventType, string>> = {
  "block.deleted": "Deletes",
  "block.inserted": "Inserts",
  "block.reordered": "Reorders",
  "block.updated": "Edits",
  "page.created": "Pages created",
  "page.duplicated": "Pages duplicated",
  "page.metadata.updated": "Page metadata",
  "page.repositioned": "Page moves",
  "page.settings.updated": "Page settings",
};

export function countEventsByType(
  events: PageActivityEvent[]
): ActivityTypeCount[] {
  const counts = new Map<PageActivityEventType | "other", number>();

  for (const event of events) {
    const key = event.type in ACTIVITY_TYPE_LABELS ? event.type : "other";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([type, count]) => ({
      type,
      count,
      label:
        type === "other"
          ? "Other"
          : (ACTIVITY_TYPE_LABELS[type as PageActivityEventType] ?? type),
    }))
    .sort((left, right) => right.count - left.count);
}

/** High-level grouping of event types for the composed activity chart. */
export type ActivityCategory = "content" | "structure" | "lifecycle";

const EVENT_CATEGORY: Record<PageActivityEventType, ActivityCategory> = {
  "block.updated": "content",
  "block.inserted": "content",
  "block.deleted": "content",
  "block.reordered": "structure",
  "page.repositioned": "structure",
  "page.created": "lifecycle",
  "page.duplicated": "lifecycle",
  "page.metadata.updated": "lifecycle",
  "page.settings.updated": "lifecycle",
};

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  content: "Writing",
  structure: "Structure",
  lifecycle: "Page changes",
};

export interface ActivityDayDetail {
  /** Distinct pages touched that day — the secondary-axis line. */
  activePages: number;
  content: number;
  /** Short display label, e.g. `Jun 21`. */
  date: string;
  /** `YYYY-MM-DD` sort/key. */
  dayKey: string;
  lifecycle: number;
  structure: number;
  total: number;
}

/**
 * Daily buckets split by category plus the number of distinct pages touched,
 * for the last `days` calendar days (inclusive). Powers the composed bar+line
 * activity chart.
 */
export function bucketEventsByDayDetailed(
  events: PageActivityEvent[],
  days = 30
): ActivityDayDetail[] {
  const buckets = new Map<
    string,
    { detail: ActivityDayDetail; pages: Set<string> }
  >();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const dayKey = toDayKey(date.toISOString());
    buckets.set(dayKey, {
      detail: {
        date: formatDayLabel(dayKey),
        dayKey,
        content: 0,
        structure: 0,
        lifecycle: 0,
        total: 0,
        activePages: 0,
      },
      pages: new Set<string>(),
    });
  }

  for (const event of events) {
    const dayKey = toDayKey(event.timestamp);
    const bucket = buckets.get(dayKey);
    if (!bucket) {
      continue;
    }
    const category = EVENT_CATEGORY[event.type] ?? "lifecycle";
    bucket.detail[category] += 1;
    bucket.detail.total += 1;
    bucket.pages.add(event.pageId);
  }

  return [...buckets.values()].map(({ detail, pages }) => ({
    ...detail,
    activePages: pages.size,
  }));
}

export interface ActivityHeatmapCell {
  count: number;
  /** 0–23 local hour. */
  hour: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
}

export interface ActivityHeatmap {
  /** Total events per hour (index 0–23). */
  byHour: number[];
  /** Total events per weekday (index 0–6). */
  byWeekday: number[];
  cells: ActivityHeatmapCell[];
  max: number;
  /** The single busiest weekday/hour slot, if any activity exists. */
  peak: { weekday: number; hour: number; count: number } | null;
}

/** Builds a 7×24 weekday/hour activity grid from event timestamps. */
export function buildActivityHeatmap(
  events: PageActivityEvent[]
): ActivityHeatmap {
  const grid = new Map<string, number>();
  const byWeekday = new Array<number>(7).fill(0);
  const byHour = new Array<number>(24).fill(0);
  let max = 0;
  let peak: ActivityHeatmap["peak"] = null;

  for (const event of events) {
    const date = new Date(event.timestamp);
    const weekday = date.getDay();
    const hour = date.getHours();
    const key = `${weekday}:${hour}`;
    const next = (grid.get(key) ?? 0) + 1;
    grid.set(key, next);
    byWeekday[weekday] += 1;
    byHour[hour] += 1;
    if (next > max) {
      max = next;
      peak = { weekday, hour, count: next };
    }
  }

  const cells: ActivityHeatmapCell[] = [];
  for (let weekday = 0; weekday < 7; weekday += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      cells.push({
        weekday,
        hour,
        count: grid.get(`${weekday}:${hour}`) ?? 0,
      });
    }
  }

  return { cells, max, byWeekday, byHour, peak };
}

export interface ActivityStreak {
  /** Total distinct days with any activity. */
  activeDays: number;
  /** The single most active day, if any. */
  busiestDay: { dayKey: string; date: string; count: number } | null;
  /** Consecutive days with activity ending today or yesterday. */
  currentStreak: number;
  /** Longest consecutive run of active days on record. */
  longestStreak: number;
}

/** Computes writing streaks and the busiest day from event timestamps. */
export function computeActivityStreak(
  events: PageActivityEvent[]
): ActivityStreak {
  const perDay = new Map<string, number>();
  for (const event of events) {
    const dayKey = toDayKey(event.timestamp);
    perDay.set(dayKey, (perDay.get(dayKey) ?? 0) + 1);
  }

  if (perDay.size === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      activeDays: 0,
      busiestDay: null,
    };
  }

  const sortedKeys = [...perDay.keys()].sort();
  const activeSet = new Set(sortedKeys);

  // Longest run of consecutive calendar days.
  let longestStreak = 0;
  let run = 0;
  let previous: Date | null = null;
  for (const dayKey of sortedKeys) {
    const [year, month, day] = dayKey.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    if (previous && isNextDay(previous, date)) {
      run += 1;
    } else {
      run = 1;
    }
    longestStreak = Math.max(longestStreak, run);
    previous = date;
  }

  // Current streak walks backwards from today (tolerating "yesterday" end).
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!activeSet.has(toDayKey(cursor.toISOString()))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let currentStreak = 0;
  while (activeSet.has(toDayKey(cursor.toISOString()))) {
    currentStreak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  let busiestDay: ActivityStreak["busiestDay"] = null;
  for (const [dayKey, count] of perDay) {
    if (!busiestDay || count > busiestDay.count) {
      busiestDay = { dayKey, date: formatDayLabel(dayKey), count };
    }
  }

  return {
    currentStreak,
    longestStreak,
    activeDays: perDay.size,
    busiestDay,
  };
}

function isNextDay(previous: Date, current: Date): boolean {
  const next = new Date(previous);
  next.setDate(previous.getDate() + 1);
  return (
    next.getFullYear() === current.getFullYear() &&
    next.getMonth() === current.getMonth() &&
    next.getDate() === current.getDate()
  );
}
