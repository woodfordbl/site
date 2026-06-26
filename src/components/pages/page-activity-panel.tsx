"use client";

import { useMemo } from "react";

import { usePageBlocks } from "@/db/queries/use-page-blocks.ts";
import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { buildPageActivitySummary } from "@/lib/pages/page-activity-summary.ts";
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
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground tabular-nums">{value}</span>
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

  const summary = useMemo(
    () =>
      buildPageActivitySummary({
        blocks,
        localBlocks: liveLocalBlocks,
        localPage,
      }),
    [blocks, liveLocalBlocks, localPage]
  );

  return (
    <div className={cn("space-y-1.5 px-2 py-2", className)}>
      <StatRow label="Total blocks" value={String(summary.blockCount)} />
      <StatRow label="Total words" value={String(summary.wordCount)} />
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
    </div>
  );
}
