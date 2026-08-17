import {
  type DayRange,
  eachDayKey,
  formatDayLabel,
  startOfDay,
  toDayKey,
} from "@/lib/pages/analytics-range.ts";

export interface SnapshotWordPoint {
  timestamp: string;
  wordCount: number;
}

export interface SnapshotPageDescriptors {
  descriptors: SnapshotWordPoint[];
  pageId: string;
}

export interface ContentTimelineDay {
  /** Total words across all pages as of the end of that day. */
  cumulativeWords: number;
  date: string;
  dayKey: string;
  /** Words added that day (sum of positive word-count deltas across pages). */
  wordsAdded: number;
}

interface NormalizedPoint {
  dayKey: string;
  epoch: number;
  epochDay: number;
  wordCount: number;
}

/**
 * Reconstructs a words-written-over-time series from version-history snapshot
 * descriptors (each carries a `wordCount` + `timestamp`). Daily bars are the
 * sum of positive word-count deltas; the cumulative line carries each page's
 * most recent word count forward across the range.
 *
 * Coverage is bounded by snapshot retention, so this approximates rather than
 * perfectly reconstructs history — good enough for a growth trend.
 */
export function buildContentTimeline(
  pages: SnapshotPageDescriptors[],
  range: DayRange
): ContentTimelineDay[] {
  const rangeKeys = eachDayKey(range);
  const rangeKeySet = new Set(rangeKeys);
  const wordsAdded = new Map<string, number>();
  const cumulativeByDay = new Map<string, number>();

  for (const page of pages) {
    const points: NormalizedPoint[] = page.descriptors
      .map((point) => {
        const date = new Date(point.timestamp);
        return {
          epoch: date.getTime(),
          epochDay: startOfDay(date).getTime(),
          dayKey: toDayKey(date),
          wordCount: point.wordCount,
        };
      })
      .sort((left, right) => left.epoch - right.epoch);

    let previousWords = 0;
    for (const point of points) {
      const delta = Math.max(0, point.wordCount - previousWords);
      if (delta > 0 && rangeKeySet.has(point.dayKey)) {
        wordsAdded.set(
          point.dayKey,
          (wordsAdded.get(point.dayKey) ?? 0) + delta
        );
      }
      previousWords = point.wordCount;
    }

    let index = 0;
    let carry = 0;
    for (const dayKey of rangeKeys) {
      const [year, month, day] = dayKey.split("-").map(Number);
      const dayEpoch = startOfDay(new Date(year, month - 1, day)).getTime();
      while (index < points.length && points[index].epochDay <= dayEpoch) {
        carry = points[index].wordCount;
        index += 1;
      }
      cumulativeByDay.set(dayKey, (cumulativeByDay.get(dayKey) ?? 0) + carry);
    }
  }

  return rangeKeys.map((dayKey) => {
    const [year, month, day] = dayKey.split("-").map(Number);
    return {
      date: formatDayLabel(new Date(year, month - 1, day)),
      dayKey,
      wordsAdded: wordsAdded.get(dayKey) ?? 0,
      cumulativeWords: cumulativeByDay.get(dayKey) ?? 0,
    };
  });
}
