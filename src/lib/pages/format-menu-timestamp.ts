/**
 * Absolute timestamp used by menu footers (page stats, block "Added / Last
 * edited", database info): "Today at 3:24 PM" or "Mar 3, 2026, 3:24 PM". Pure
 * given `now`, so it is deterministic in tests.
 */
export function formatMenuTimestamp(
  iso: string,
  now: number = Date.now()
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  const today = new Date(now);
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  if (isToday) {
    return `Today at ${date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
