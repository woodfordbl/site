import { IconPlus } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { insertDatabaseRow } from "@/db/queries/database-collection-ops.ts";
import type { LocalDatabaseRow } from "@/lib/schemas/database.ts";

interface DatabaseAddRowProps {
  databaseId: string;
  /** Fired with the created row so the grid can focus its primary cell. */
  onRowInserted?: (row: LocalDatabaseRow) => void;
}

/**
 * Edit-mode bottom strip: a full-width ghost "New row" button appended after
 * the grid body. Muted at rest, stronger on hover.
 */
export function DatabaseAddRow({
  databaseId,
  onRowInserted,
}: DatabaseAddRowProps): ReactNode {
  return (
    <button
      className="flex h-9 w-full items-center gap-1.5 px-2 text-muted-foreground/70 text-sm outline-none transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:bg-muted/50 focus-visible:text-foreground"
      onClick={() => {
        const row = insertDatabaseRow(databaseId);
        onRowInserted?.(row);
      }}
      type="button"
    >
      {/* Keep the label visible while the grid is scrolled horizontally. */}
      <span className="sticky left-2 inline-flex items-center gap-1.5">
        <IconPlus className="size-4 stroke-[1.5px]" />
        New row
      </span>
    </button>
  );
}
