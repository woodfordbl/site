import { IconDatabase } from "@tabler/icons-react";
import { useCallback, useRef, useState } from "react";

import {
  DatabaseBlockLoading,
  useDatabaseBlockReady,
} from "@/components/blocks/types/database/database-block-gate.tsx";
import { DatabaseCreatePanel } from "@/components/database/database-create-panel.tsx";
import { DatabaseTableView } from "@/components/database/database-table-view.tsx";
import { PlaceholderTrigger } from "@/components/ui/placeholder-trigger.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { useDatabase } from "@/db/queries/use-database.ts";
import { useAutoFocus } from "@/hooks/use-auto-focus.ts";
import { useInlineCustomBlockKeys } from "@/hooks/use-inline-custom-block-keys.ts";
import type { BlockEditProps } from "@/lib/canvas/block-spec.types.ts";
import { tryDeleteSelectedDatabaseTableRows } from "@/lib/databases/database-table-row-selection.ts";

type DatabaseEditProps = BlockEditProps<"database">;

/**
 * Editable `database` block: an unlinked block shows the shared placeholder
 * trigger opening the creation popover (media/embed source-picker
 * conventions) with New, Linked, and Synced tabs; a
 * linked block renders the database's table view in edit mode. All grid
 * complexity lives in `components/database/`.
 */
export function DatabaseEdit({
  autoFocus,
  onAutoFocusHandled,
  onChange,
  props,
  onExtendSelectionDown,
  onExtendSelectionUp,
  onMoveRowDown,
  onMoveRowUp,
  onNavigateDown,
  onNavigateUp,
  onStructuralKey,
  row,
}: DatabaseEditProps) {
  const focusRef = useRef<HTMLButtonElement | HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const hasDatabase = props.databaseId !== "";
  // Gate mounting the table view: SSR safety (useLiveQuery has no server
  // snapshot) + the shipped-database seed window on first visit.
  const tableReady = useDatabaseBlockReady();

  const applyAutoFocus = useCallback(() => {
    focusRef.current?.focus();
    if (!hasDatabase) {
      setPickerOpen(true);
    }
  }, [hasDatabase]);

  useAutoFocus({
    enabled: autoFocus,
    onFocus: applyAutoFocus,
    onHandled: onAutoFocusHandled,
  });

  const handleKeyDown = useInlineCustomBlockKeys({
    onExtendSelectionDown,
    onExtendSelectionUp,
    onMoveRowDown,
    onMoveRowUp,
    onNavigateDown,
    onNavigateUp,
    onStructuralKey,
  });

  const handleCreated = (databaseId: string) => {
    setPickerOpen(false);
    onChange({ ...props, databaseId });
  };

  const handleWrapperKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (
      (event.key === "Backspace" || event.key === "Delete") &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      row?.rowId &&
      tryDeleteSelectedDatabaseTableRows([row.rowId])
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    // Keys from the grid's interactive children (cell inputs, header
    // controls) must never reach the structural handler — a Backspace typed
    // in a cell would otherwise delete the whole block.
    if (event.target !== event.currentTarget) {
      return;
    }
    handleKeyDown(event);
  };

  if (!hasDatabase) {
    return (
      <Popover onOpenChange={setPickerOpen} open={pickerOpen}>
        <PopoverTrigger
          render={
            <PlaceholderTrigger
              icon={<IconDatabase />}
              onKeyDown={handleKeyDown}
              ref={focusRef as React.RefObject<HTMLButtonElement>}
            />
          }
        >
          New, linked, or synced table
        </PopoverTrigger>
        <PopoverContent
          className="w-96"
          finalFocus={false}
          initialFocus={false}
        >
          <DatabaseCreatePanel onCreated={handleCreated} />
        </PopoverContent>
      </Popover>
    );
  }

  if (!tableReady) {
    return (
      // biome-ignore lint/a11y/noNoninteractiveElementInteractions: composite block focus surface for structural keys
      // biome-ignore lint/a11y/useSemanticElements: cannot be a <button>; contains interactive children
      <div
        aria-label="Database block"
        className={databaseBlockWrapperClassName}
        data-database-block=""
        onKeyDown={handleWrapperKeyDown}
        ref={focusRef as React.RefObject<HTMLDivElement>}
        role="group"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the block itself is the keyboard target
        tabIndex={0}
      >
        <DatabaseBlockLoading />
      </div>
    );
  }

  return (
    <LinkedDatabaseBlock
      onChange={onChange}
      onKeyDown={handleWrapperKeyDown}
      props={props}
      ref={focusRef as React.RefObject<HTMLDivElement>}
      rowId={row?.rowId}
    />
  );
}

const databaseBlockWrapperClassName =
  "outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0";

/**
 * The linked half of a `database` block. Split out so the live queries below
 * only ever run past {@link useDatabaseBlockReady} — `useLiveQuery` has no
 * server snapshot, and calling it during a server render throws "Missing
 * getServerSnapshot", which aborts the whole page render and silently drops
 * the site to a client-rendered shell. Hooks cannot be conditional, so the
 * gate has to be a mount boundary rather than an early return.
 */
function LinkedDatabaseBlock({
  onChange,
  onKeyDown,
  props,
  ref,
  rowId,
}: {
  onChange: DatabaseEditProps["onChange"];
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  props: DatabaseEditProps["props"];
  ref: React.RefObject<HTMLDivElement>;
  rowId: string | undefined;
}) {
  const database = useDatabase(props.databaseId);

  // No definition for the linked id: the database was deleted before the
  // delete cascade existed, or a shipped page references a database whose
  // document is missing. Say so; never repair it. This component renders on an
  // ordinary page visit, so deleting the row here wrote a local overlay that
  // silently dropped the block from the reader's copy of a pristine shipped
  // page — measured on 6 of 6 loads of `/` before `content/databases/` was
  // filled in. Removing a block is the reader's call, not a side effect of
  // looking at the page.
  if (database === undefined) {
    return (
      <div className="rounded-lg border border-border border-dashed px-3 py-2 text-muted-foreground text-sm">
        This database is unavailable.
      </div>
    );
  }

  return (
    // Focusable group for structural keys (cannot be a <button> — the grid
    // hosts interactive children). No focus ring: a ring around the whole
    // database reads as block chrome and fights the select gutter.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: composite block focus surface for structural keys
    // biome-ignore lint/a11y/useSemanticElements: cannot be a <button>; contains interactive children
    <div
      aria-label="Database block"
      className={databaseBlockWrapperClassName}
      data-database-block=""
      onKeyDown={onKeyDown}
      ref={ref}
      role="group"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the block itself is the keyboard target
      tabIndex={0}
    >
      <DatabaseTableView
        canvasRowId={rowId}
        databaseId={props.databaseId}
        hideTitle={props.hideTitle}
        mode="edit"
        onHideTitleChange={(hideTitle) => onChange({ ...props, hideTitle })}
        onViewIdChange={(viewId) => onChange({ ...props, viewId })}
        viewId={props.viewId}
      />
    </div>
  );
}
