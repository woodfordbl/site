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
