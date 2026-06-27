/** Inclusive day-granular date range (local time). */
export interface DayRange {
  from: Date;
  to: Date;
}

export type RangePresetId = "7d" | "30d" | "90d" | "all";

export const RANGE_PRESETS: Array<{ id: RangePresetId; label: string }> = [
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "all", label: "All" },
];

const PRESET_DAYS: Record<Exclude<RangePresetId, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

/**
 * Resolves a preset to a concrete inclusive range ending today. `all` spans
 * from `earliest` (the oldest data point) to today, falling back to one year.
 */
export function presetToRange(
  preset: RangePresetId,
  now: Date,
  earliest?: Date
): DayRange {
  const to = endOfDay(now);
  if (preset === "all") {
    const fallback = new Date(now);
    fallback.setFullYear(fallback.getFullYear() - 1);
    return { from: startOfDay(earliest ?? fallback), to };
  }
  const from = startOfDay(now);
  from.setDate(from.getDate() - (PRESET_DAYS[preset] - 1));
  return { from, to };
}

/** Number of inclusive calendar days in the range (minimum 1). */
export function rangeDayCount(range: DayRange): number {
  const ms = startOfDay(range.to).getTime() - startOfDay(range.from).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

function toDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDayLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Ordered day keys (YYYY-MM-DD) spanning the range inclusively. */
export function eachDayKey(range: DayRange): string[] {
  const keys: string[] = [];
  const cursor = startOfDay(range.from);
  const last = startOfDay(range.to);
  // Cap to avoid pathological ranges blowing up the array.
  let guard = 0;
  while (cursor.getTime() <= last.getTime() && guard < 1500) {
    keys.push(toDayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return keys;
}

export { toDayKey };

/** Human label for the active range, e.g. `Jun 1 – Jun 27`. */
export function formatRangeLabel(range: DayRange): string {
  return `${formatDayLabel(range.from)} – ${formatDayLabel(range.to)}`;
}
