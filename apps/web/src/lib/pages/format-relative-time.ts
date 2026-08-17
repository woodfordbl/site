const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Compact human-friendly relative time: "just now", "5m ago", "2h ago",
 * "yesterday", then an absolute date ("Mar 3" / "Mar 3, 2024"). Pure given
 * `now`, so it is deterministic in tests.
 */
export function formatRelativeTime(
  iso: string,
  now: number = Date.now()
): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) {
    return "unknown";
  }

  const diff = now - then;
  if (diff < MINUTE_MS) {
    return "just now";
  }
  if (diff < HOUR_MS) {
    return `${Math.floor(diff / MINUTE_MS)}m ago`;
  }
  if (diff < DAY_MS) {
    return `${Math.floor(diff / HOUR_MS)}h ago`;
  }

  const dayDelta = Math.round(
    (startOfLocalDay(now) - startOfLocalDay(then)) / DAY_MS
  );
  if (dayDelta === 1) {
    return "yesterday";
  }

  const date = new Date(then);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
