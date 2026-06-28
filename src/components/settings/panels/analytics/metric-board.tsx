import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";

import { RankedBarList } from "@/components/settings/panels/analytics/ranked-bar-list.tsx";
import { StorageBreakdown } from "@/components/settings/panels/analytics/storage-breakdown.tsx";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  useChartGradientDither,
} from "@/components/ui/chart.tsx";
import { formatBytes, formatNumber } from "@/lib/format.ts";
import type { ContentTimelineDay } from "@/lib/pages/content-timeline.ts";
import type { ActivityDayDetail } from "@/lib/pages/page-activity-analytics.ts";
import type { PageCreationDay } from "@/lib/pages/page-lifecycle-analytics.ts";
import type { StorageStats } from "@/lib/pages/storage-stats.ts";

export type BoardMetric = "edits" | "pages" | "words" | "storage";

const editsConfig = {
  content: { label: "Writing", color: "var(--chart-1)" },
  structure: { label: "Structure", color: "var(--chart-3)" },
  lifecycle: { label: "Page changes", color: "var(--chart-2)" },
  activePages: { label: "Active pages", color: "var(--chart-5)" },
} satisfies ChartConfig;

const pagesConfig = {
  created: { label: "Created", color: "var(--chart-1)" },
  cumulative: { label: "Total pages", color: "var(--chart-5)" },
} satisfies ChartConfig;

const wordsConfig = {
  wordsAdded: { label: "Words added", color: "var(--chart-1)" },
  cumulativeWords: { label: "Total words", color: "var(--chart-5)" },
} satisfies ChartConfig;

const BOARD_HEIGHT = "h-[260px]";

const sharedAxes = {
  left: { width: 32 },
  right: { width: 40 },
} as const;

function EmptyBoard({ message }: { message: string }) {
  return (
    <div className="flex h-[260px] items-center justify-center text-muted-foreground text-sm">
      {message}
    </div>
  );
}

function PagesBoard({ data }: { data: PageCreationDay[] }) {
  const dither = useChartGradientDither(pagesConfig);

  return (
    <ChartContainer
      className={`aspect-auto ${BOARD_HEIGHT} w-full`}
      config={pagesConfig}
      ref={dither.ref}
    >
      <ComposedChart accessibilityLayer data={data}>
        {dither.defs}
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
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
          width={sharedAxes.left.width}
          yAxisId="left"
        />
        <YAxis
          allowDecimals={false}
          axisLine={false}
          orientation="right"
          tickLine={false}
          width={sharedAxes.right.width}
          yAxisId="right"
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar
          dataKey="created"
          fill={dither.fill("created")}
          radius={[4, 4, 0, 0]}
          yAxisId="left"
        />
        <Line
          dataKey="cumulative"
          dot={false}
          stroke="var(--color-cumulative)"
          strokeWidth={2}
          type="monotone"
          yAxisId="right"
        />
        <ChartLegend content={<ChartLegendContent />} />
      </ComposedChart>
    </ChartContainer>
  );
}

function WordsBoard({ data }: { data: ContentTimelineDay[] }) {
  const dither = useChartGradientDither(wordsConfig);

  return (
    <ChartContainer
      className={`aspect-auto ${BOARD_HEIGHT} w-full`}
      config={wordsConfig}
      ref={dither.ref}
    >
      <ComposedChart accessibilityLayer data={data}>
        {dither.defs}
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
          tickFormatter={(value: number) => formatNumber(value)}
          tickLine={false}
          width={sharedAxes.left.width}
          yAxisId="left"
        />
        <YAxis
          axisLine={false}
          orientation="right"
          tickFormatter={(value: number) => formatNumber(value)}
          tickLine={false}
          width={sharedAxes.right.width}
          yAxisId="right"
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar
          dataKey="wordsAdded"
          fill={dither.fill("wordsAdded")}
          radius={[4, 4, 0, 0]}
          yAxisId="left"
        />
        <Line
          dataKey="cumulativeWords"
          dot={false}
          stroke="var(--color-cumulativeWords)"
          strokeWidth={2}
          type="monotone"
          yAxisId="right"
        />
        <ChartLegend content={<ChartLegendContent />} />
      </ComposedChart>
    </ChartContainer>
  );
}

function EditsBoard({ data }: { data: ActivityDayDetail[] }) {
  const dither = useChartGradientDither(editsConfig);

  return (
    <ChartContainer
      className={`aspect-auto ${BOARD_HEIGHT} w-full`}
      config={editsConfig}
      ref={dither.ref}
    >
      <ComposedChart accessibilityLayer data={data}>
        {dither.defs}
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
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
          width={sharedAxes.left.width}
          yAxisId="left"
        />
        <YAxis
          allowDecimals={false}
          axisLine={false}
          orientation="right"
          tickLine={false}
          width={sharedAxes.right.width}
          yAxisId="right"
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar
          dataKey="content"
          fill={dither.fill("content")}
          stackId="activity"
          yAxisId="left"
        />
        <Bar
          dataKey="structure"
          fill={dither.fill("structure")}
          stackId="activity"
          yAxisId="left"
        />
        <Bar
          dataKey="lifecycle"
          fill={dither.fill("lifecycle")}
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
}: MetricBoardProps) {
  if (metric === "storage") {
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

  if (metric === "pages") {
    const hasData = pages.some((day) => day.created > 0 || day.cumulative > 0);
    if (!hasData) {
      return <EmptyBoard message="No pages created in this period." />;
    }
    return <PagesBoard data={pages} />;
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
    if (!hasData) {
      return <EmptyBoard message="No word activity in this period." />;
    }
    return <WordsBoard data={words} />;
  }

  // metric === "edits"
  const hasData = edits.some((day) => day.total > 0);
  if (!hasData) {
    return <EmptyBoard message="No tracked edits in this period." />;
  }
  return <EditsBoard data={edits} />;
}
