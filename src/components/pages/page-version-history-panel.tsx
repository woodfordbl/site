"use client";

import { IconArrowBackUp } from "@tabler/icons-react";

import { Button } from "@/components/ui/button.tsx";
import { DropdownMenuLabel } from "@/components/ui/dropdown-menu.tsx";
import { usePageSnapshots } from "@/db/queries/use-page-snapshots.ts";
import { formatRelativeTime } from "@/lib/pages/format-relative-time.ts";
import type { PageSnapshotDescriptor } from "@/lib/pages/page-snapshot-types.ts";

interface PageVersionHistoryPanelProps {
  onRequestRestore: (descriptor: PageSnapshotDescriptor) => void;
  open: boolean;
  pageId: string;
}

/** Inline version-history list for the header menu (restore confirm lives in the parent). */
export function PageVersionHistoryPanel({
  open,
  pageId,
  onRequestRestore,
}: PageVersionHistoryPanelProps) {
  const { descriptors, isLoading } = usePageSnapshots(pageId, open);

  return (
    <>
      <DropdownMenuLabel className="text-muted-foreground">
        Version history
      </DropdownMenuLabel>
      {descriptors.length === 0 ? (
        <p className="px-2 py-1.5 text-muted-foreground text-xs">
          {isLoading ? "Loading…" : "No saved versions yet."}
        </p>
      ) : (
        <div className="max-h-56 space-y-0.5 overflow-y-auto px-1 pb-1">
          {descriptors.map((descriptor) => (
            <div
              className="flex items-center justify-between gap-2 rounded-sm px-2 py-1 hover:bg-accent"
              key={descriptor.id}
            >
              <div className="min-w-0">
                <div className="truncate text-foreground text-xs">
                  {formatRelativeTime(descriptor.timestamp)}
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  {descriptor.blockCount} blocks · {descriptor.wordCount} words
                </div>
              </div>
              <Button
                aria-label={`Restore version from ${formatRelativeTime(descriptor.timestamp)}`}
                className="shrink-0 text-muted-foreground"
                onClick={() => onRequestRestore(descriptor)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <IconArrowBackUp aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
