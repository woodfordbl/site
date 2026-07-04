import { IconRefresh } from "@tabler/icons-react";
import { type ReactNode, useState } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { requestImmediateSync } from "@/db/sync/database-sync-engine.ts";
import { useSyncStatus } from "@/hooks/use-sync-status.ts";
import { cn } from "@/lib/utils.ts";

interface DatabaseSyncStatusChipProps {
  databaseId: string;
}

/**
 * Minimal sync affordance in a synced database's title row. The table is
 * watched live while on screen (see `watchDatabaseSync`), so there is no
 * "Synced x ago" label — diagnostics live in Settings → Source. States:
 * a spinning refresh glyph while a pass is in flight, a muted destructive
 * dot (message in the tooltip) after a failed pass, and a tiny muted
 * refresh glyph when idle+healthy so click-to-refresh stays discoverable.
 * Clicking requests an immediate sync. `requestImmediateSync` only succeeds
 * in the tab that owns the schedule, so a refused click drops the hover
 * affordance — but every click re-attempts and any status transition
 * clears the refusal, so the chip recovers as scheduling ownership moves
 * (rows still arrive via storage events meanwhile).
 */
export function DatabaseSyncStatusChip({
  databaseId,
}: DatabaseSyncStatusChipProps): ReactNode {
  const status = useSyncStatus(databaseId);
  // True while the LAST refresh attempt was refused (`requestImmediateSync`
  // returned false — this tab doesn't own the database's sync schedule
  // right now). Deliberately not a one-way latch: ownership changes over a
  // tab's lifetime, so the chip's look derives only from the current
  // attempt's result plus the status subscription below.
  const [lastAttemptRefused, setLastAttemptRefused] = useState(false);

  // The engine publishes a new immutable status object per state change
  // (pass started/landed/failed). Any transition observed here means this
  // tab is receiving sync activity, so a past refusal is stale — restore
  // the active affordance. Render-time state adjustment (React's
  // derive-from-props pattern) rather than an effect: no extra commit with
  // the stale look.
  const [seenStatus, setSeenStatus] = useState(status);
  if (seenStatus !== status) {
    setSeenStatus(status);
    setLastAttemptRefused(false);
  }

  const handleClick = () => {
    // Attempt on EVERY click — never latch a past refusal.
    setLastAttemptRefused(!requestImmediateSync(databaseId));
  };

  let glyph: ReactNode;
  let tooltip: string;
  if (status.syncing) {
    glyph = (
      <IconRefresh aria-hidden className="size-3 animate-spin stroke-[1.5px]" />
    );
    tooltip = "Sync in progress";
  } else if (status.error) {
    glyph = (
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full bg-destructive/70"
      />
    );
    tooltip = status.error.message;
  } else {
    glyph = <IconRefresh aria-hidden className="size-3 stroke-[1.5px]" />;
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
              lastAttemptRefused || status.syncing
                ? "cursor-default"
                : "hover:bg-muted/50 hover:text-foreground focus-visible:bg-muted/50"
            )}
            onClick={handleClick}
            type="button"
          />
        }
      >
        {glyph}
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
