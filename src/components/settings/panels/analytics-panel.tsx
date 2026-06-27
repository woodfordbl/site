"use client";

import { IconChartBar } from "@tabler/icons-react";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

import { SettingsPanelShell } from "@/components/settings/settings-panel-shell.tsx";
import { getSettingsSection } from "@/components/settings/site-settings-sections.ts";
import {
  type ChartConfig,
  ChartContainer,
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
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { useSiteActivityAnalytics } from "@/hooks/use-site-activity-analytics.ts";
import type { SettingsSearch } from "@/lib/settings/settings-search.ts";

const editsOverTimeConfig = {
  count: {
    label: "Edits",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const pagesConfig = {
  count: {
    label: "Events",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

const typeConfig = {
  count: {
    label: "Events",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

interface AnalyticsPanelProps {
  search: SettingsSearch;
}

export function AnalyticsPanel({ search }: AnalyticsPanelProps) {
  const section = getSettingsSection("analytics");
  const { byDay, byPage, byType, isLoading, totalEvents } =
    useSiteActivityAnalytics(true);
  const { pages } = useMergedPageListItems();

  const pageTitleById = useMemo(
    () => new Map(pages.map((page) => [page.id, page.title])),
    [pages]
  );

  const topPages = useMemo(
    () =>
      byPage.slice(0, 8).map((entry) => ({
        count: entry.count,
        page: pageTitleById.get(entry.pageId) ?? "Untitled page",
      })),
    [byPage, pageTitleById]
  );

  const typeRows = useMemo(
    () =>
      byType.slice(0, 6).map((entry) => ({
        count: entry.count,
        label: entry.label,
      })),
    [byType]
  );

  if (!isLoading && totalEvents === 0) {
    return (
      <SettingsPanelShell
        description="See editing activity across your workspace."
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
              Start editing pages to see activity charts here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </SettingsPanelShell>
    );
  }

  return (
    <SettingsPanelShell
      description="See editing activity across your workspace."
      search={search}
      section={section}
    >
      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-sm">Edits over time</h2>
        <ChartContainer
          className="aspect-auto h-[200px] w-full"
          config={editsOverTimeConfig}
          palette="grey"
        >
          <AreaChart accessibilityLayer data={byDay}>
            <CartesianGrid vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="date"
              tickLine={false}
              tickMargin={8}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              dataKey="count"
              fill="var(--color-count)"
              fillOpacity={0.25}
              stroke="var(--color-count)"
              type="monotone"
            />
          </AreaChart>
        </ChartContainer>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-sm">Most edited pages</h2>
        <ChartContainer
          className="aspect-auto h-[220px] w-full"
          config={pagesConfig}
          palette="grey"
        >
          <BarChart accessibilityLayer data={topPages} layout="vertical">
            <CartesianGrid horizontal={false} />
            <XAxis axisLine={false} tickLine={false} type="number" />
            <YAxis
              axisLine={false}
              dataKey="page"
              tickLine={false}
              type="category"
              width={120}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={4} />
          </BarChart>
        </ChartContainer>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-sm">Activity breakdown</h2>
        <ChartContainer
          className="aspect-auto h-[200px] w-full"
          config={typeConfig}
          palette="grey"
        >
          <BarChart accessibilityLayer data={typeRows}>
            <CartesianGrid vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="label"
              tickLine={false}
              tickMargin={8}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={4} />
          </BarChart>
        </ChartContainer>
      </section>
    </SettingsPanelShell>
  );
}
