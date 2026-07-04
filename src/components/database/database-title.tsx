import { IconDatabase } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";

import { DatabaseSettingsMenu } from "@/components/database/database-settings-menu.tsx";
import { DatabaseSyncStatusChip } from "@/components/database/database-sync-status-chip.tsx";
import { useFocusOnMount } from "@/components/database/use-focus-on-mount.ts";
import { GlyphIconPicker } from "@/components/pages/glyph-icon-picker.tsx";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  renameDatabase,
  setDatabaseIcon,
} from "@/db/queries/database-collection-ops.ts";
import { headingTypographyClassNames } from "@/lib/blocks/heading-typography.ts";
import type { ChartData } from "@/lib/databases/chart-data.ts";
import { ensurePageIconPickerReady } from "@/lib/pages/preload-page-icon-picker.ts";
import type { DatabaseView, LocalDatabase } from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

// Same typography as the canvas `heading` block at level 3 so a database
// title reads as an h3 in the page hierarchy (edit button, view h3, and the
// rename input all share it so entering edit mode doesn't jump).
const TITLE_TYPOGRAPHY_CLASS = cn(
  headingTypographyClassNames[3],
  "text-foreground"
);

interface DatabaseTitleProps {
  /** The resolved active view — settings menu scope (Properties/Group/…). */
  activeView: DatabaseView;
  /** Chart dataset for a chart active view — the settings menu color rows. */
  chartData?: ChartData;
  /** Extra right-aligned controls before the ⋯ menu (mobile filter/sort). */
  controls?: ReactNode;
  database: LocalDatabase;
  /** Hide the name; the row keeps only right-aligned controls. */
  hideTitle?: boolean;
  mode: "view" | "edit";
  /** Settings menu "Delete database" hook — removes the hosting block after. */
  onDeleteDatabase?: () => void;
  /** Threads the block's `hideTitle` toggle into the settings menu. */
  onHideTitleChange?: (hideTitle: boolean) => void;
  /** Activates a view (settings menu Add/Duplicate switch to the new view). */
  onViewIdChange?: (viewId: string) => void;
  /** Total (unfiltered) row count — settings menu stats and Source section. */
  totalRowCount: number;
  /** The saved-view tabs (`DatabaseViewSwitcher`), mounted after the name. */
  viewSwitcher?: ReactNode;
}

/**
 * The database's icon beside its name. Edit mode renders a picker trigger
 * (emoji or `tabler:` glyph, falling back to the database glyph when unset)
 * that opens the shared {@link GlyphIconPicker} to set/change/remove it,
 * writing through `setDatabaseIcon`. View mode renders the icon only when one
 * is actually set, so published databases without an icon stay clean.
 */
function DatabaseTitleIcon({
  database,
  mode,
}: {
  database: LocalDatabase;
  mode: "view" | "edit";
}): ReactNode {
  const [pickerOpen, setPickerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();

  const writeIcon = (icon: string | undefined) => {
    setDatabaseIcon(database.id, icon);
  };

  const iconDisplay = database.icon ? (
    <PageIconDisplay className="[&_svg]:size-5" icon={database.icon} />
  ) : (
    <IconDatabase className="size-5 shrink-0 stroke-[1.5px] text-muted-foreground" />
  );

  if (mode === "view") {
    return database.icon ? (
      <span className="flex size-6 shrink-0 items-center justify-center self-center">
        {iconDisplay}
      </span>
    ) : null;
  }

  return (
    <>
      <Button
        aria-label="Change database icon"
        className="shrink-0 self-center text-muted-foreground"
        onClick={() => {
          setPickerOpen(true);
        }}
        onPointerEnter={() => {
          // Warm the picker chunks + icon catalogs on intent (AGENTS.md).
          ensurePageIconPickerReady(queryClient);
        }}
        ref={triggerRef}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        {iconDisplay}
      </Button>
      <GlyphIconPicker
        anchor={triggerRef}
        ariaLabel="Change database icon"
        hideTrigger
        icon={database.icon}
        onOpenChange={setPickerOpen}
        onRemove={() => {
          writeIcon(undefined);
        }}
        onSelect={writeIcon}
        open={pickerOpen}
      />
    </>
  );
}

/**
 * Database name above the grid (h3-equivalent typography). In edit mode the
 * name is inline-editable (click to edit, commit via `renameDatabase` on
 * blur/Enter, Escape reverts) and the right-aligned control cluster holds
 * optional mobile toolbar buttons plus the ⋯ settings menu — revealed on row
 * hover/focus on fine pointers, always visible on coarse pointers
 * (`.hover-reveal` + `data-reveal-group`). Row counts live in the settings
 * menu (stats footer / Source section), not in the title row. The saved-view
 * switcher tabs mount between the name and the control cluster.
 */
export function DatabaseTitle({
  activeView,
  chartData,
  controls,
  database,
  hideTitle = false,
  mode,
  onDeleteDatabase,
  onHideTitleChange,
  onViewIdChange,
  totalRowCount,
  viewSwitcher,
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

  let nameDisplay: ReactNode;
  if (mode === "edit") {
    nameDisplay = (
      <button
        className={cn(
          "min-w-0 truncate rounded-sm text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50",
          TITLE_TYPOGRAPHY_CLASS
        )}
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
      <h3 className={cn("min-w-0 truncate", TITLE_TYPOGRAPHY_CLASS)}>{name}</h3>
    );
  }

  return (
    <div className="flex min-w-0 items-baseline gap-2" data-reveal-group>
      {hideTitle ? null : (
        <>
          <DatabaseTitleIcon database={database} mode={mode} />
          {draft === null ? (
            nameDisplay
          ) : (
            <input
              aria-label="Database name"
              className={cn(
                "min-w-0 flex-1 rounded-none border-none bg-transparent p-0 outline-none placeholder:text-muted-foreground",
                TITLE_TYPOGRAPHY_CLASS
              )}
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
          {database.source?.kind === "connector" ? (
            <DatabaseSyncStatusChip databaseId={databaseId} />
          ) : null}
        </>
      )}
      {viewSwitcher ? (
        <div className="min-w-0 shrink self-center">{viewSwitcher}</div>
      ) : null}
      {mode === "edit" ? (
        <div className="ml-auto flex shrink-0 items-center gap-0.5 self-center">
          {controls}
          <DatabaseSettingsMenu
            activeView={activeView}
            chartData={chartData}
            database={database}
            hideTitle={hideTitle}
            onDeleted={onDeleteDatabase}
            onHideTitleChange={onHideTitleChange}
            onViewIdChange={onViewIdChange}
            rowCount={totalRowCount}
          />
        </div>
      ) : null}
    </div>
  );
}
