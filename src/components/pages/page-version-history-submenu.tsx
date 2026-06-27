"use client";

import { IconHistory } from "@tabler/icons-react";

import { useVersionPreview } from "@/components/pages/version-preview-context.tsx";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { usePageSnapshots } from "@/db/queries/use-page-snapshots.ts";
import { formatRelativeTime } from "@/lib/pages/format-relative-time.ts";

/**
 * Version picker in the page ⋯ menu — a submenu (popover on desktop, sub-drawer
 * on touch) listing saved versions. Selecting one closes the menu and renders
 * that checkpoint read-only over the page ([`PageVersionPreview`](./page-version-preview.tsx)).
 */
export function PageVersionHistorySubmenu({ pageId }: { pageId: string }) {
  const preview = useVersionPreview();
  const { descriptors, isLoading } = usePageSnapshots(pageId, true);

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <IconHistory />
        Version history
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-[60vh] min-w-56 overflow-y-auto">
        {descriptors.length === 0 ? (
          <div className="px-3 py-3 text-muted-foreground text-sm">
            {isLoading ? "Loading…" : "No saved versions yet."}
          </div>
        ) : (
          descriptors.map((descriptor) => (
            <DropdownMenuItem
              key={descriptor.id}
              onClick={() => preview?.enterPreview(descriptor)}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-foreground">
                  {formatRelativeTime(descriptor.timestamp)}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {descriptor.blockCount} blocks · {descriptor.wordCount} words
                </span>
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
