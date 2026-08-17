import { type ReactNode, useMemo } from "react";

import {
  type BoardSeries,
  type DeltaBarRow,
  DeltaTotalBoard,
  type TotalRow,
} from "@/components/settings/panels/analytics/delta-total-board.tsx";
import { RankedBarList } from "@/components/settings/panels/analytics/ranked-bar-list.tsx";
import { StorageBreakdown } from "@/components/settings/panels/analytics/storage-breakdown.tsx";
import { formatBytes, formatNumber } from "@/lib/format.ts";
import type { ContentTimelineDay } from "@/lib/pages/content-timeline.ts";
import type { ActivityDayDetail } from "@/lib/pages/page-activity-analytics.ts";
import type { PageCreationDay } from "@/lib/pages/page-lifecycle-analytics.ts";
import type { StorageStats } from "@/lib/pages/storage-stats.ts";

/**
 * @fileoverview The analytics panel's main board: one of four metrics, each
 * shaped as per-day activity plus the total that activity accumulates to (see
 * `delta-total-board.tsx`), except storage — a point-in-time split with no time
 * dimension, so it renders as meters instead.
 *
 * Every board reduces its own day type to the board's two tidy row shapes here,
 * so the chart layer sees one dataset shape regardless of metric.
 */

export type BoardMetric = "edits" | "pages" | "words" | "storage";

const BOARD_HEIGHT_CLASS = "h-[260px]";

/** Any analytics day: a sort key and the short axis label for it. */
interface AnalyticsDay {
  date: string;
  dayKey: string;
}

/** `YYYY-MM-DD` → short axis label, for the shared date axis. */
function dayLabelMap(
  days: readonly AnalyticsDay[]
): ReadonlyMap<string, string> {
  return new Map(days.map((day) => [day.dayKey, day.date]));
}

/** One bar series' rows, read off each day by key. */
function barRows<TDay extends AnalyticsDay>(
  days: readonly TDay[],
  series: BoardSeries,
  value: (day: TDay) => number
): DeltaBarRow[] {
  return days.map((day) => ({
    day: day.dayKey,
    label: series.label,
    series: series.key,
    value: value(day),
  }));
}

/** The running-total strip's rows. */
function totalRows<TDay extends AnalyticsDay>(
  days: readonly TDay[],
  series: BoardSeries,
  value: (day: TDay) => number
): TotalRow[] {
  return days.map((day) => ({
    day: day.dayKey,
    label: series.label,
    series: series.key,
    value: value(day),
  }));
}

function EmptyBoard({ message }: { message: string }) {
  return (
    <div
      className={`flex ${BOARD_HEIGHT_CLASS} items-center justify-center text-muted-foreground text-sm`}
    >
      {message}
    </div>
  );
}

const CREATED_SERIES: BoardSeries = {
  key: "created",
  label: "Created",
  token: 1,
};
const TOTAL_PAGES_SERIES: BoardSeries = {
  key: "cumulative",
  label: "Total pages",
  token: 5,
};

const PAGES_BAR_SERIES = [CREATED_SERIES];

function PagesBoard({ data }: { data: PageCreationDay[] }) {
  const board = useMemo(
    () => ({
      bars: barRows(data, CREATED_SERIES, (day) => day.created),
      dayLabels: dayLabelMap(data),
      total: totalRows(data, TOTAL_PAGES_SERIES, (day) => day.cumulative),
    }),
    [data]
  );
  return (
    <DeltaTotalBoard
      ariaLabel="Pages created per day"
      barSeries={PAGES_BAR_SERIES}
      bars={board.bars}
      dayLabels={board.dayLabels}
      formatValue={formatNumber}
      total={board.total}
      totalSeries={TOTAL_PAGES_SERIES}
    />
  );
}

const WORDS_ADDED_SERIES: BoardSeries = {
  key: "wordsAdded",
  label: "Words added",
  token: 1,
};
const TOTAL_WORDS_SERIES: BoardSeries = {
  key: "cumulativeWords",
  label: "Total words",
  token: 5,
};

const WORDS_BAR_SERIES = [WORDS_ADDED_SERIES];

function WordsBoard({ data }: { data: ContentTimelineDay[] }) {
  const board = useMemo(
    () => ({
      bars: barRows(data, WORDS_ADDED_SERIES, (day) => day.wordsAdded),
      dayLabels: dayLabelMap(data),
      total: totalRows(data, TOTAL_WORDS_SERIES, (day) => day.cumulativeWords),
    }),
    [data]
  );
  return (
    <DeltaTotalBoard
      ariaLabel="Words added per day"
      barSeries={WORDS_BAR_SERIES}
      bars={board.bars}
      dayLabels={board.dayLabels}
      formatValue={formatNumber}
      total={board.total}
      totalSeries={TOTAL_WORDS_SERIES}
    />
  );
}

const EDIT_SERIES: readonly BoardSeries[] = [
  { key: "content", label: "Writing", token: 1 },
  { key: "structure", label: "Structure", token: 3 },
  { key: "lifecycle", label: "Page changes", token: 2 },
];
const ACTIVE_PAGES_SERIES: BoardSeries = {
  key: "activePages",
  label: "Active pages",
  token: 5,
};

/** Which edit-category count each stacked series reads off a day. */
const EDIT_VALUES: Record<string, (day: ActivityDayDetail) => number> = {
  content: (day) => day.content,
  structure: (day) => day.structure,
  lifecycle: (day) => day.lifecycle,
};

function EditsBoard({ data }: { data: ActivityDayDetail[] }) {
  const board = useMemo(
    () => ({
      bars: EDIT_SERIES.flatMap((series) =>
        barRows(data, series, EDIT_VALUES[series.key])
      ),
      dayLabels: dayLabelMap(data),
      total: totalRows(data, ACTIVE_PAGES_SERIES, (day) => day.activePages),
    }),
    [data]
  );
  return (
    <DeltaTotalBoard
      ariaLabel="Edits per day by category"
      barSeries={EDIT_SERIES}
      bars={board.bars}
      dayLabels={board.dayLabels}
      formatValue={formatNumber}
      total={board.total}
      totalSeries={ACTIVE_PAGES_SERIES}
    />
  );
}

function StorageBoard({
  storage,
  storageLoading,
}: {
  storage: StorageStats | undefined;
  storageLoading: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      {storage && storage.categories.length > 0 ? (
        <StorageBreakdown
          categories={storage.categories}
          total={storage.totalTrackedBytes}
        />
      ) : (
        <EmptyBoard
          message={
            storageLoading ? "Measuring storage…" : "Nothing stored yet."
          }
        />
      )}
      {storage && storage.assetTypes.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="font-medium text-muted-foreground text-xs">
            Media assets by type
          </h3>
          <RankedBarList
            colorVar="var(--chart-1)"
            items={storage.assetTypes.map((entry) => ({
              key: entry.key,
              label: `${entry.label} · ${entry.count}`,
              value: entry.bytes,
              display: formatBytes(entry.bytes),
            }))}
          />
        </div>
      ) : null}
    </div>
  );
}

interface MetricBoardProps {
  edits: ActivityDayDetail[];
  hasSnapshots: boolean;
  metric: BoardMetric;
  pages: PageCreationDay[];
  storage: StorageStats | undefined;
  storageLoading: boolean;
  words: ContentTimelineDay[];
}

export function MetricBoard({
  metric,
  edits,
  pages,
  words,
  storage,
  storageLoading,
  hasSnapshots,
}: MetricBoardProps): ReactNode {
  if (metric === "storage") {
    return <StorageBoard storage={storage} storageLoading={storageLoading} />;
  }

  if (metric === "pages") {
    const hasData = pages.some((day) => day.created > 0 || day.cumulative > 0);
    return hasData ? (
      <PagesBoard data={pages} />
    ) : (
      <EmptyBoard message="No pages created in this period." />
    );
  }

  if (metric === "words") {
    if (!hasSnapshots) {
      return (
        <EmptyBoard message="Word history builds from version snapshots as you edit." />
      );
    }
    const hasData = words.some(
      (day) => day.wordsAdded > 0 || day.cumulativeWords > 0
    );
    return hasData ? (
      <WordsBoard data={words} />
    ) : (
      <EmptyBoard message="No word activity in this period." />
    );
  }

  const hasData = edits.some((day) => day.total > 0);
  return hasData ? (
    <EditsBoard data={edits} />
  ) : (
    <EmptyBoard message="No tracked edits in this period." />
  );
}
