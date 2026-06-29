"use client";

import {
  IconActivity,
  IconChartBar,
  IconDatabase,
  IconFileText,
  IconPencil,
} from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";

import { AnalyticsHeatmapSection } from "@/components/settings/panels/analytics/analytics-heatmap-section.tsx";
import { AnalyticsSection } from "@/components/settings/panels/analytics/analytics-section.tsx";
import {
  type BoardMetric,
  MetricBoard,
} from "@/components/settings/panels/analytics/metric-board.tsx";
import { AnalyticsRangePicker } from "@/components/settings/panels/analytics/range-picker.tsx";
import {
  type RankedBarItem,
  RankedBarList,
} from "@/components/settings/panels/analytics/ranked-bar-list.tsx";
import { StatCard } from "@/components/settings/panels/analytics/stat-card.tsx";
import { StorageBreakdown } from "@/components/settings/panels/analytics/storage-breakdown.tsx";
import { WordCloud } from "@/components/settings/panels/analytics/word-cloud.tsx";
import { SettingsPanelShell } from "@/components/settings/settings-panel-shell.tsx";
import { getSettingsSection } from "@/components/settings/site-settings-sections.ts";
import { ChartPaletteScope } from "@/components/ui/chart.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { useContentAnalytics } from "@/hooks/use-content-analytics.ts";
import { useLocalPages } from "@/hooks/use-local-pages.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { useSiteActivityAnalytics } from "@/hooks/use-site-activity-analytics.ts";
import { useSnapshotTimeline } from "@/hooks/use-snapshot-timeline.ts";
import { useStorageAnalytics } from "@/hooks/use-storage-analytics.ts";
import {
  formatBytes,
  formatCompactNumber,
  formatNumber,
  formatPercent,
} from "@/lib/format.ts";
import {
  type DayRange,
  formatRangeLabel,
  presetToRange,
  type RangePresetId,
} from "@/lib/pages/analytics-range.ts";
import { BLOCK_TYPE_LABELS } from "@/lib/pages/content-stats.ts";
import { buildContentTimeline } from "@/lib/pages/content-timeline.ts";
import { bucketActivityByRange } from "@/lib/pages/page-activity-analytics.ts";
import { bucketPagesCreatedByDay } from "@/lib/pages/page-lifecycle-analytics.ts";

const BOARD_META: Record<
  BoardMetric,
  { label: string; title: string; timeSeries: boolean }
> = {
  edits: { label: "Edits", title: "Edits over time", timeSeries: true },
  pages: { label: "Pages", title: "Pages created over time", timeSeries: true },
  words: { label: "Words", title: "Words written over time", timeSeries: true },
  storage: { label: "Storage", title: "Storage breakdown", timeSeries: false },
};

function storageSummaryLabel(
  storageTotal: number,
  quotaRatio: number | undefined
): string {
  if (quotaRatio) {
    return `${formatBytes(storageTotal)} tracked · ${formatPercent(quotaRatio, 1)} of your browser quota in use`;
  }
  return `${formatBytes(storageTotal)} stored locally in your browser`;
}

export function AnalyticsPanel() {
  const section = getSettingsSection("analytics");

  const [metric, setMetric] = useState<BoardMetric>("edits");
  const [preset, setPreset] = useState<RangePresetId | "custom">("30d");
  const [range, setRange] = useState<DayRange>(() =>
    presetToRange("30d", new Date())
  );

  const {
    events,
    byPage,
    byType,
    heatmap,
    streak,
    totalEvents,
    isLoading: activityLoading,
  } = useSiteActivityAnalytics(true);
  const {
    contentStats,
    wordFrequency,
    isLoading: contentLoading,
  } = useContentAnalytics();
  const { stats: storage, isLoading: storageLoading } = useStorageAnalytics();
  const { pages: snapshotPages, isLoading: snapshotsLoading } =
    useSnapshotTimeline();
  const localPages = useLocalPages();
  const { pages } = useMergedPageListItems();

  const earliest = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    const oldestEvent = events.at(-1);
    if (oldestEvent) {
      min = Math.min(min, new Date(oldestEvent.timestamp).getTime());
    }
    for (const page of localPages) {
      min = Math.min(min, new Date(page.createdAt).getTime());
    }
    return Number.isFinite(min) ? new Date(min) : undefined;
  }, [events, localPages]);

  const handlePreset = useCallback(
    (next: RangePresetId) => {
      setPreset(next);
      setRange(presetToRange(next, new Date(), earliest));
    },
    [earliest]
  );

  const handleCustomRange = useCallback((next: DayRange) => {
    setPreset("custom");
    setRange(next);
  }, []);

  const editsData = useMemo(
    () => bucketActivityByRange(events, range),
    [events, range]
  );
  const pagesData = useMemo(
    () =>
      bucketPagesCreatedByDay(
        localPages.map((page) => ({
          createdAt: page.createdAt,
          deletedAt: page.deletedAt,
        })),
        range
      ),
    [localPages, range]
  );
  const wordsData = useMemo(
    () => buildContentTimeline(snapshotPages, range),
    [snapshotPages, range]
  );

  const pageTitleById = useMemo(
    () => new Map(pages.map((page) => [page.id, page.title])),
    [pages]
  );

  const mostEditedPages = useMemo<RankedBarItem[]>(
    () =>
      byPage.slice(0, 6).map((entry) => ({
        key: entry.pageId,
        label: pageTitleById.get(entry.pageId) ?? "Untitled page",
        value: entry.count,
      })),
    [byPage, pageTitleById]
  );

  const activityByType = useMemo<RankedBarItem[]>(
    () =>
      byType.slice(0, 6).map((entry) => ({
        key: entry.type,
        label: entry.label,
        value: entry.count,
      })),
    [byType]
  );

  const biggestPages = useMemo<RankedBarItem[]>(
    () =>
      contentStats.perPage
        .filter((page) => page.words > 0)
        .slice(0, 6)
        .map((page) => ({
          key: page.pageId,
          label: page.title || "Untitled page",
          value: page.words,
          display: `${formatNumber(page.words)} words`,
        })),
    [contentStats.perPage]
  );

  const blockComposition = useMemo<RankedBarItem[]>(
    () =>
      contentStats.blockTypeCounts.slice(0, 8).map((entry) => ({
        key: entry.type,
        label: BLOCK_TYPE_LABELS[entry.type],
        value: entry.count,
      })),
    [contentStats.blockTypeCounts]
  );

  const assetTypeItems = useMemo<RankedBarItem[]>(
    () =>
      (storage?.assetTypes ?? []).map((entry) => ({
        key: entry.key,
        label: `${entry.label} · ${entry.count}`,
        value: entry.bytes,
        display: formatBytes(entry.bytes),
      })),
    [storage?.assetTypes]
  );

  const isEmpty =
    !(activityLoading || contentLoading) &&
    totalEvents === 0 &&
    contentStats.totalWords === 0 &&
    contentStats.pageCount === 0;

  if (isEmpty) {
    return (
      <SettingsPanelShell
        description="Insights into your writing, activity, and local storage."
        section={section}
      >
        <Empty className="min-h-[240px] border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconChartBar />
            </EmptyMedia>
            <EmptyTitle>No activity yet</EmptyTitle>
            <EmptyDescription>
              Start writing pages to see your workspace come to life here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </SettingsPanelShell>
    );
  }

  const reading = contentStats.readingMinutes;
  const storageTotal = storage?.totalTrackedBytes ?? 0;
  const quotaRatio =
    storage?.quota && storage.quotaUsage
      ? storage.quotaUsage / storage.quota
      : undefined;

  const boardMeta = BOARD_META[metric];
  const storageSummary = storageSummaryLabel(storageTotal, quotaRatio);
  const boardDescription = boardMeta.timeSeries
    ? formatRangeLabel(range)
    : storageSummary;

  return (
    <SettingsPanelShell
      description="Insights into your writing, activity, and local storage."
      section={section}
    >
      <ChartPaletteScope>
        <MetricKpiRow
          activityLoading={activityLoading}
          contentLoading={contentLoading}
          contentStats={contentStats}
          metric={metric}
          onSelect={setMetric}
          reading={reading}
          storage={storage}
          storageLoading={storageLoading}
          storageTotal={storageTotal}
          streak={streak}
          totalEvents={totalEvents}
        />

        <AnalyticsSection
          action={
            <AnalyticsRangePicker
              disabled={!boardMeta.timeSeries}
              onCustomRange={handleCustomRange}
              onPreset={handlePreset}
              preset={preset}
              range={range}
            />
          }
          description={boardDescription}
          title={boardMeta.title}
        >
          <MetricBoard
            edits={editsData}
            hasSnapshots={snapshotPages.length > 0}
            metric={metric}
            pages={pagesData}
            storage={storage}
            storageLoading={storageLoading || snapshotsLoading}
            words={wordsData}
          />
        </AnalyticsSection>

        <AnalyticsHeatmapSection heatmap={heatmap} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AnalyticsSection
            description="Where your edits land most often."
            title="Most edited pages"
          >
            <RankedBarList
              colorVar="var(--chart-4)"
              emptyLabel="No tracked edits yet."
              items={mostEditedPages}
            />
          </AnalyticsSection>
          <AnalyticsSection
            description="What kinds of edits you make most."
            title="Activity breakdown"
          >
            <RankedBarList
              colorVar="var(--chart-2)"
              emptyLabel="No tracked edits yet."
              items={activityByType}
            />
          </AnalyticsSection>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AnalyticsSection
            description="Your longest pages by word count."
            title="Biggest pages"
          >
            <RankedBarList
              colorVar="var(--chart-1)"
              emptyLabel="No written content yet."
              items={biggestPages}
            />
          </AnalyticsSection>
          <AnalyticsSection
            description="The blocks your pages are built from."
            title="What your content is made of"
          >
            <RankedBarList
              colorVar="var(--chart-3)"
              emptyLabel="No blocks yet."
              items={blockComposition}
            />
          </AnalyticsSection>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AnalyticsSection
            description={storageSummary}
            title="Storage breakdown"
          >
            {storage && storage.categories.length > 0 ? (
              <StorageBreakdown
                categories={storage.categories}
                total={storage.totalTrackedBytes}
              />
            ) : (
              <p className="py-6 text-center text-muted-foreground text-sm">
                {storageLoading ? "Measuring storage…" : "Nothing stored yet."}
              </p>
            )}
          </AnalyticsSection>
          <AnalyticsSection
            description={
              storage
                ? `${formatNumber(storage.assetCount)} assets · ${formatBytes(storage.assetBytes)} total`
                : "Locally stored images, GIFs, and video."
            }
            title="Media assets"
          >
            <RankedBarList
              colorVar="var(--chart-1)"
              emptyLabel={
                storageLoading ? "Measuring assets…" : "No media uploaded yet."
              }
              items={assetTypeItems}
            />
          </AnalyticsSection>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AnalyticsSection
            description={`${formatNumber(wordFrequency.uniqueWords)} unique words in your vocabulary.`}
            title="Most-used words"
          >
            <WordCloud words={wordFrequency.top} />
          </AnalyticsSection>
          <AnalyticsSection
            description="The fun stuff."
            title="Writing insights"
          >
            <div className="grid grid-cols-2 gap-3">
              <InsightStat
                label="Current streak"
                value={`${streak.currentStreak} ${streak.currentStreak === 1 ? "day" : "days"}`}
              />
              <InsightStat
                label="Longest streak"
                value={`${streak.longestStreak} ${streak.longestStreak === 1 ? "day" : "days"}`}
              />
              <InsightStat
                hint={
                  streak.busiestDay
                    ? `${formatNumber(streak.busiestDay.count)} edits`
                    : undefined
                }
                label="Busiest day"
                value={streak.busiestDay?.date ?? "-"}
              />
              <InsightStat
                label="Active days"
                value={formatNumber(streak.activeDays)}
              />
              <InsightStat
                label="Total characters"
                value={formatCompactNumber(contentStats.totalCharacters)}
              />
              <InsightStat
                hint="at 200 wpm"
                label="Reading time"
                value={`${reading} min`}
              />
            </div>
          </AnalyticsSection>
        </div>
      </ChartPaletteScope>
    </SettingsPanelShell>
  );
}

interface MetricKpiRowProps {
  activityLoading: boolean;
  contentLoading: boolean;
  contentStats: ReturnType<typeof useContentAnalytics>["contentStats"];
  metric: BoardMetric;
  onSelect: (metric: BoardMetric) => void;
  reading: number;
  storage: ReturnType<typeof useStorageAnalytics>["stats"];
  storageLoading: boolean;
  storageTotal: number;
  streak: ReturnType<typeof useSiteActivityAnalytics>["streak"];
  totalEvents: number;
}

function MetricKpiRow({
  metric,
  onSelect,
  contentStats,
  streak,
  storage,
  totalEvents,
  storageTotal,
  reading,
  contentLoading,
  activityLoading,
  storageLoading,
}: MetricKpiRowProps) {
  const wordsHint =
    reading > 0
      ? `≈ ${reading} min read · ${formatNumber(contentStats.avgWordsPerPage)}/page`
      : "across your workspace";
  const editsHint =
    streak.currentStreak > 0
      ? `${streak.currentStreak}-day streak`
      : `${formatNumber(streak.activeDays)} active days`;
  const storageHint = storage
    ? `${formatNumber(storage.assetCount)} media assets`
    : "-";

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard
        hint={wordsHint}
        icon={<IconPencil />}
        isLoading={contentLoading}
        label="Words written"
        onSelect={() => onSelect("words")}
        selected={metric === "words"}
        value={formatNumber(contentStats.totalWords)}
      />
      <StatCard
        hint={`${formatNumber(contentStats.totalBlocks)} blocks`}
        icon={<IconFileText />}
        isLoading={contentLoading}
        label="Pages"
        onSelect={() => onSelect("pages")}
        selected={metric === "pages"}
        value={formatNumber(contentStats.pageCount)}
      />
      <StatCard
        hint={editsHint}
        icon={<IconActivity />}
        isLoading={activityLoading}
        label="Edits tracked"
        onSelect={() => onSelect("edits")}
        selected={metric === "edits"}
        value={formatNumber(totalEvents)}
      />
      <StatCard
        hint={storageHint}
        icon={<IconDatabase />}
        isLoading={storageLoading}
        label="Storage used"
        onSelect={() => onSelect("storage")}
        selected={metric === "storage"}
        value={formatBytes(storageTotal)}
      />
    </div>
  );
}

function InsightStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-muted/40 p-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-heading font-medium text-lg leading-tight">
        {value}
      </span>
      {hint ? (
        <span className="text-muted-foreground/70 text-xs">{hint}</span>
      ) : null}
    </div>
  );
}
