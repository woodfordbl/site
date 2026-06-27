import { useBlockGutterMenu } from "@/components/canvas/block-gutter-menu/block-gutter-menu-context.tsx";
import { useLocalBlockTimestamps } from "@/db/queries/use-local-block-timestamps.ts";
import { formatRelativeTime } from "@/lib/pages/format-relative-time.ts";

function TimestampRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground tabular-nums">{value}</span>
    </div>
  );
}

/** Inline "Added / Last edited" footer for the block actions menu. */
export function BlockGutterMenuTimestamps() {
  const { effectiveBlockId } = useBlockGutterMenu();
  const { createdAt, updatedAt } = useLocalBlockTimestamps(effectiveBlockId);

  if (!(createdAt || updatedAt)) {
    return null;
  }

  return (
    <div className="space-y-1.5 px-2 py-2">
      <TimestampRow
        label="Added"
        value={createdAt ? formatRelativeTime(createdAt) : "Unknown"}
      />
      <TimestampRow
        label="Last edited"
        value={updatedAt ? formatRelativeTime(updatedAt) : "Unknown"}
      />
    </div>
  );
}
