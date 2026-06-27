"use client";

import {
  IconActivity,
  IconChartBar,
  IconDatabase,
  IconFileText,
  IconPencil,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";

import { AnalyticsHeatmapSection } from "@/components/settings/panels/analytics/analytics-heatmap-section.tsx";
import { AnalyticsSection } from "@/components/settings/panels/analytics/analytics-section.tsx";
import {
  type RankedBarItem,
  RankedBarList,
} from "@/components/settings/panels/analytics/ranked-bar-list.tsx";
import { StatCard } from "@/components/settings/panels/analytics/stat-card.tsx";
import { StorageBreakdown } from "@/components/settings/panels/analytics/storage-breakdown.tsx";
import { WordCloud } from "@/components/settings/panels/analytics/word-cloud.tsx";
import { SettingsPanelShell } from "@/components/settings/settings-panel-shell.tsx";
import { getSettingsSection } from "@/components/settings/site-settings-sections.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { useContentAnalytics } from "@/hooks/use-content-analytics.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { useSiteActivityAnalytics } from "@/hooks/use-site-activity-analytics.ts";
import { useStorageAnalytics } from "@/hooks/use-storage-analytics.ts";
import {
  formatBytes,
  formatCompactNumber,
  formatNumber,
  formatPercent,
} from "@/lib/format.ts";
import { BLOCK_TYPE_LABELS } from "@/lib/pages/content-stats.ts";
import type { SettingsSearch } from "@/lib/settings/settings-search.ts";

const activityChartConfig = {
  content: { label: "Writing", color: "var(--chart-1)" },
  structure: { label: "Structure", color: "var(--chart-3)" },
  lifecycle: { label: "Page changes", color: "var(--chart-2)" },
  activePages: { label: "Active pages", color: "var(--chart-5)" },
} satisfies ChartConfig;

const RANGE_OPTIONS = [
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

interface AnalyticsPanelProps {
  search: SettingsSearch;
}

export function AnalyticsPanel({ search }: AnalyticsPanelProps) {
  const section = getSettingsSection("analytics");
  const [rangeDays, setRangeDays] = useState<number>(30);

  const {
    byDayDetailed,
    byPage,
    byType,
    heatmap,
    streak,
    totalEvents,
    isLoading: activityLoading,
  } = useSiteActivityAnalytics(true, rangeDays);
  const {
    contentStats,
    wordFrequency,
    isLoading: contentLoading,
  } = useContentAnalytics();
  const { stats: storage, isLoading: storageLoading } = useStorageAnalytics();
  const { pages } = useMergedPageListItems();

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
        search={search}
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

  return (
    <SettingsPanelShell
      description="Insights into your writing, activity, and local storage."
      search={search}
      section={section}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          accent
          hint={
            reading > 0
              ? `≈ ${reading} min read · ${formatNumber(contentStats.avgWordsPerPage)}/page`
              : "across your workspace"
          }
          icon={<IconPencil />}
          isLoading={contentLoading}
          label="Words written"
          value={formatNumber(contentStats.totalWords)}
        />
        <StatCard
          hint={`${formatNumber(contentStats.totalBlocks)} blocks`}
          icon={<IconFileText />}
          isLoading={contentLoading}
          label="Pages"
          value={formatNumber(contentStats.pageCount)}
        />
        <StatCard
          hint={
            streak.currentStreak > 0
              ? `${streak.currentStreak}-day streak`
              : `${formatNumber(streak.activeDays)} active days`
          }
          icon={<IconActivity />}
          isLoading={activityLoading}
          label="Edits tracked"
          value={formatNumber(totalEvents)}
        />
        <StatCard
          hint={
            storage ? `${formatNumber(storage.assetCount)} media assets` : "—"
          }
          icon={<IconDatabase />}
          isLoading={storageLoading}
          label="Storage used"
          value={formatBytes(storageTotal)}
        />
      </div>

      <AnalyticsSection
        action={
          <div className="flex gap-1">
            {RANGE_OPTIONS.map((option) => (
              <Button
                key={option.days}
                onClick={() => setRangeDays(option.days)}
                size="xs"
                variant={rangeDays === option.days ? "secondary" : "ghost"}
              >
                {option.label}
              </Button>
            ))}
          </div>
        }
        description="Edits grouped by kind, with the number of pages you touched each day."
        title="Activity over time"
      >
        <ChartContainer
          className="aspect-auto h-[240px] w-full"
          config={activityChartConfig}
        >
          <ComposedChart accessibilityLayer data={byDayDetailed}>
            <CartesianGrid vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="date"
              interval="preserveStartEnd"
              minTickGap={24}
              tickLine={false}
              tickMargin={8}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={28}
              yAxisId="left"
            />
            <YAxis
              axisLine={false}
              orientation="right"
              tickLine={false}
              width={28}
              yAxisId="right"
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              dataKey="content"
              fill="var(--color-content)"
              radius={[0, 0, 0, 0]}
              stackId="activity"
              yAxisId="left"
            />
            <Bar
              dataKey="structure"
              fill="var(--color-structure)"
              stackId="activity"
              yAxisId="left"
            />
            <Bar
              dataKey="lifecycle"
              fill="var(--color-lifecycle)"
              radius={[4, 4, 0, 0]}
              stackId="activity"
              yAxisId="left"
            />
            <Line
              dataKey="activePages"
              dot={false}
              stroke="var(--color-activePages)"
              strokeWidth={2}
              type="monotone"
              yAxisId="right"
            />
            <ChartLegend content={<ChartLegendContent />} />
          </ComposedChart>
        </ChartContainer>
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
          description={
            quotaRatio
              ? `${formatBytes(storageTotal)} tracked · ${formatPercent(quotaRatio, 1)} of your browser quota in use`
              : `${formatBytes(storageTotal)} stored locally in your browser`
          }
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
        <AnalyticsSection description="The fun stuff." title="Writing insights">
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
              value={streak.busiestDay?.date ?? "—"}
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
    </SettingsPanelShell>
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
