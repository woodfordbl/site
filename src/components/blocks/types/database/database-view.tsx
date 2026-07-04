import { DatabaseTableView } from "@/components/database/database-table-view.tsx";
import type { BlockViewProps } from "@/lib/canvas/block-spec.types.ts";

type DatabaseViewProps = BlockViewProps<"database">;

/**
 * Read-only `database` block: renders the referenced database's saved view
 * (`props.viewId`, first view fallback). An unlinked block (empty
 * `databaseId`) shows a muted empty shell — linking happens through the
 * edit-mode placeholder flow. No `onViewIdChange`: view mode can't write
 * block props, so tab switches stay ephemeral local state in the entry.
 */
export function DatabaseView({ props }: DatabaseViewProps) {
  if (props.databaseId === "") {
    return (
      <div className="text-muted-foreground text-sm">No database linked</div>
    );
  }

  return (
    <DatabaseTableView
      databaseId={props.databaseId}
      hideTitle={props.hideTitle}
      mode="view"
      viewId={props.viewId}
    />
  );
}
