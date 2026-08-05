"use client";

import { useMemo } from "react";

import { usePageBlocks } from "@/db/queries/use-page-blocks.ts";
import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { usePageListItems } from "@/hooks/use-page-list.ts";
import { buildPageActivitySummary } from "@/lib/pages/page-activity-summary.ts";
import { SITE_AUTHOR_NAME } from "@/lib/site/site-author.ts";
import { cn } from "@/lib/utils.ts";

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
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

interface PageActivityPanelProps {
  className?: string;
  pageId: string;
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex min-w-0 items-baseline justify-between gap-3 whitespace-nowrap text-xs"
      data-slot="page-activity-row"
    >
      <span
        className="shrink-0 whitespace-nowrap text-muted-foreground"
        data-slot="page-activity-label"
      >
        {label}
      </span>
      <span
        className="min-w-0 flex-1 truncate text-right text-foreground tabular-nums"
        data-slot="page-activity-value"
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

/** Inline page stats footer for the header menu dropdown. */
export function PageActivityPanel({
  className,
  pageId,
}: PageActivityPanelProps) {
  const localPage = useLocalPageById(pageId);
  const { blocks, liveLocalBlocks } = usePageBlocks(pageId);
  const { pages: serverPages } = usePageListItems();
  const serverPage = useMemo(
    () => serverPages.find((page) => page.id === pageId) ?? null,
    [pageId, serverPages]
  );

  const summary = useMemo(
    () =>
      buildPageActivitySummary({
        blocks,
        localBlocks: liveLocalBlocks,
        localPage,
        serverPage,
      }),
    [blocks, liveLocalBlocks, localPage, serverPage]
  );

  return (
    <div className={cn("space-y-1.5 px-2 py-2", className)}>
      <StatRow
        label="Created at"
        value={
          summary.createdAt ? formatTimestamp(summary.createdAt) : "Unknown"
        }
      />
      <StatRow
        label="Last edited at"
        value={
          summary.lastEditedAt
            ? formatTimestamp(summary.lastEditedAt)
            : "Unknown"
        }
      />
      <StatRow label="Last edited by" value={SITE_AUTHOR_NAME} />
    </div>
  );
}
