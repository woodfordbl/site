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
 * Clicking requests an immediate sync — leader-only, so in follower tabs
 * the first click that returns `false` switches the chip to a no-op look
 * (rows still arrive via storage events).
 */
export function DatabaseSyncStatusChip({
  databaseId,
}: DatabaseSyncStatusChipProps): ReactNode {
  const status = useSyncStatus(databaseId);
  // False after a click was refused (follower tab) — no-op look from then on.
  const [canRequestSync, setCanRequestSync] = useState(true);

  const handleClick = () => {
    if (!requestImmediateSync(databaseId)) {
      setCanRequestSync(false);
    }
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
              canRequestSync && !status.syncing
                ? "hover:bg-muted/50 hover:text-foreground focus-visible:bg-muted/50"
                : "cursor-default"
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
