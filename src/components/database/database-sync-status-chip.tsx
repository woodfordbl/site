import { IconRefresh } from "@tabler/icons-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

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
 * Minimum time the refresh glyph stays spinning after a manual (or watched)
 * pass so instant completions remain perceptible. Does not delay the sync
 * itself or gate a new refresh once the engine is idle again.
 */
export const REFRESH_SPIN_MIN_MS = 400;

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
  // Optimistic / minimum-visible hold so the glyph spins on the activating
  // click (before the external-store re-render) and for a short beat after
  // a pass that resolves too quickly to perceive.
  const [holdingSpin, setHoldingSpin] = useState(false);
  const spinStartedAtRef = useRef<number | null>(null);

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

  const spinning = status.syncing || holdingSpin;

  useEffect(() => {
    if (status.syncing) {
      // Engine owns the in-flight pass — stamp a start time for the
      // post-completion minimum hold (keep an earlier click stamp).
      spinStartedAtRef.current ??= Date.now();
      return;
    }

    if (spinStartedAtRef.current === null) {
      return;
    }

    const remaining = Math.max(
      0,
      REFRESH_SPIN_MIN_MS - (Date.now() - spinStartedAtRef.current)
    );
    setHoldingSpin(true);
    const timer = setTimeout(() => {
      spinStartedAtRef.current = null;
      setHoldingSpin(false);
    }, remaining);
    return () => {
      clearTimeout(timer);
    };
  }, [status.syncing]);

  const handleClick = () => {
    // Engine already no-ops when a pass is running; skip the call so the
    // chip does not re-enter refresh while syncing is true.
    if (status.syncing) {
      return;
    }
    // Attempt on EVERY idle click — never latch a past refusal.
    const accepted = requestImmediateSync(databaseId);
    setLastAttemptRefused(!accepted);
    if (!accepted) {
      return;
    }
    // Immediate feedback before the external-store re-render lands.
    spinStartedAtRef.current = Date.now();
    setHoldingSpin(true);
  };

  let glyph: ReactNode;
  let tooltip: string;
  if (spinning) {
    glyph = (
      <IconRefresh
        aria-hidden
        className="size-3 animate-spin stroke-[1.5px] motion-reduce:animate-none"
      />
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
            aria-busy={spinning || undefined}
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
