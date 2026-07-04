import { IconRefresh } from "@tabler/icons-react";
import { formatDistanceToNow } from "date-fns/formatDistanceToNow";
import { type ReactNode, useEffect, useState } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { requestImmediateSync } from "@/db/sync/database-sync-engine.ts";
import { useSyncStatus } from "@/hooks/use-sync-status.ts";
import { cn } from "@/lib/utils.ts";

/** Re-render cadence for the "Synced x ago" relative timestamp. */
const RELATIVE_TIME_TICK_MS = 30_000;

interface DatabaseSyncStatusChipProps {
  databaseId: string;
}

/**
 * Subtle sync-status chip in a synced database's title row, after the row
 * count: a spinning refresh glyph while a sync pass is in flight, "Synced
 * <relative time>" otherwise, and a muted destructive dot (message in the
 * tooltip) after a failed pass. Clicking requests an immediate sync —
 * leader-only, so in follower tabs the first click that returns `false`
 * switches the chip to a no-op look (rows still arrive via storage events).
 */
export function DatabaseSyncStatusChip({
  databaseId,
}: DatabaseSyncStatusChipProps): ReactNode {
  const status = useSyncStatus(databaseId);
  // False after a click was refused (follower tab) — no-op look from then on.
  const [canRequestSync, setCanRequestSync] = useState(true);

  // Keep the relative "Synced x ago" label fresh while it is visible.
  const [, setTick] = useState(0);
  const showsRelativeTime =
    !status.syncing &&
    status.error === undefined &&
    Boolean(status.lastSyncedAt);
  useEffect(() => {
    if (!showsRelativeTime) {
      return;
    }
    const interval = setInterval(() => {
      setTick((tick) => tick + 1);
    }, RELATIVE_TIME_TICK_MS);
    return () => {
      clearInterval(interval);
    };
  }, [showsRelativeTime]);

  const handleClick = () => {
    if (!requestImmediateSync(databaseId)) {
      setCanRequestSync(false);
    }
  };

  let label: ReactNode;
  let tooltip: string;
  if (status.syncing) {
    label = (
      <>
        <IconRefresh
          aria-hidden
          className="size-3 animate-spin stroke-[1.5px]"
        />
        Syncing…
      </>
    );
    tooltip = "Sync in progress";
  } else if (status.error) {
    label = (
      <>
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-destructive/70"
        />
        Sync error
      </>
    );
    tooltip = status.error.message;
  } else if (status.lastSyncedAt) {
    label = `Synced ${formatDistanceToNow(new Date(status.lastSyncedAt), {
      addSuffix: true,
    })}`;
    tooltip = "Refresh now";
  } else {
    label = (
      <>
        <IconRefresh aria-hidden className="size-3 stroke-[1.5px]" />
        Sync
      </>
    );
    tooltip = "Refresh now";
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            aria-label="Sync status — refresh now"
            className={cn(
              "inline-flex shrink-0 select-none items-center gap-1 self-center rounded-sm px-1 py-0.5 text-muted-foreground text-xs outline-none transition-colors",
              canRequestSync && !status.syncing
                ? "hover:bg-muted/50 hover:text-foreground focus-visible:bg-muted/50"
                : "cursor-default"
            )}
            onClick={handleClick}
            type="button"
          />
        }
      >
        {label}
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
