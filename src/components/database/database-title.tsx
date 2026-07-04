import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";

import { DatabaseSettingsMenu } from "@/components/database/database-settings-menu.tsx";
import { useFocusOnMount } from "@/components/database/use-focus-on-mount.ts";
import { renameDatabase } from "@/db/queries/database-collection-ops.ts";
import type { LocalDatabase } from "@/lib/schemas/database.ts";

interface DatabaseTitleProps {
  database: LocalDatabase;
  mode: "view" | "edit";
  /** Count of the active view's filtered rows. */
  rowCount: number;
  /** Total (unfiltered) row count — settings menu stats and Source section. */
  totalRowCount: number;
}

/**
 * Database name above the grid plus a muted row count. In edit mode the name
 * is inline-editable (click to edit, commit via `renameDatabase` on
 * blur/Enter, Escape reverts) and the ⋯ settings menu mounts after the row
 * count — revealed on row hover/focus on fine pointers, always visible on
 * coarse pointers (`.hover-reveal` + `data-reveal-group`).
 */
export function DatabaseTitle({
  database,
  mode,
  rowCount,
  totalRowCount,
}: DatabaseTitleProps): ReactNode {
  const { id: databaseId, name } = database;
  // `null` = display mode; a string is the in-flight draft.
  const [draft, setDraft] = useState<string | null>(null);
  const focusOnMount = useFocusOnMount({ select: true });
  const finishedRef = useRef(false);

  const commit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed !== "" && trimmed !== name) {
      renameDatabase(databaseId, trimmed);
    }
    setDraft(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      finishedRef.current = true;
      commit(event.currentTarget.value);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      finishedRef.current = true;
      setDraft(null);
    }
  };

  const countLabel = `${rowCount} ${rowCount === 1 ? "row" : "rows"}`;

  let nameDisplay: ReactNode;
  if (mode === "edit") {
    nameDisplay = (
      <button
        className="min-w-0 truncate rounded-sm text-left font-medium text-foreground text-sm outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
        onClick={() => {
          finishedRef.current = false;
          setDraft(name);
        }}
        type="button"
      >
        {name}
      </button>
    );
  } else {
    nameDisplay = (
      <span className="min-w-0 truncate font-medium text-foreground text-sm">
        {name}
      </span>
    );
  }

  return (
    <div className="flex min-w-0 items-baseline gap-2" data-reveal-group>
      {draft === null ? (
        nameDisplay
      ) : (
        <input
          aria-label="Database name"
          className="min-w-0 flex-1 rounded-none border-none bg-transparent p-0 font-medium text-foreground text-sm outline-none placeholder:text-muted-foreground"
          onBlur={(event) => {
            if (finishedRef.current) {
              return;
            }
            commit(event.currentTarget.value);
          }}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Untitled"
          ref={focusOnMount}
          type="text"
          value={draft}
        />
      )}
      <span className="shrink-0 text-muted-foreground text-xs">
        {countLabel}
      </span>
      {mode === "edit" ? (
        <DatabaseSettingsMenu database={database} rowCount={totalRowCount} />
      ) : null}
    </div>
  );
}
